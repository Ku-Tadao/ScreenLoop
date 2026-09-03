using NAudio.CoreAudioApi;
using ScreenLoop.Backend.Core.Models;
using System.Text.RegularExpressions;

namespace ScreenLoop.Backend.Windows.Audio
{
    internal class AudioDeviceService
    {
        private static string GetCleanDeviceName(string friendlyName)
        {

            // If it's Voicemeeter, Elgato, GoXLR or BEACN, return the original name
            if (friendlyName.Contains("Voicemeeter") || friendlyName.Contains("Elgato") || friendlyName.Contains("GoXLR") || friendlyName.Contains("BEACN"))
            {
                return friendlyName;
            }
            else if (friendlyName.Contains("SteelSeries Sonar"))
            {
                int index = friendlyName.IndexOf('(');
                if (index > 0)
                {
                    return friendlyName.Substring(0, index).Trim();
                }
            }

            // Looks for patterns like "Microphone (2- Shure MV7)" or "Speakers (Sound BlasterX AE-5 Plus)" or "Stereo Mix (Realtek(R) Audio)"
            // Extract the main part of the device name, handling cases with nested parentheses
            var mainPattern = @"^([^(]+)\((.+)\)$";
            var match = Regex.Match(friendlyName, mainPattern);

            if (match.Success && match.Groups.Count > 2)
            {
                // Group 2 contains everything inside the main parentheses
                var deviceName = match.Groups[2].Value.Trim();
                return deviceName;
            }

            // Fallback to original name if pattern doesn't match
            return friendlyName;
        }

        public static List<AudioDevice> GetInputDevices()
        {
            return GetDevices(DataFlow.Capture);
        }

        public static List<AudioDevice> GetOutputDevices()
        {
            return GetDevices(DataFlow.Render);
        }

        /// <summary>
        /// Enumerates active endpoints for one direction, with the system default listed
        /// first. Every MMDevice and the enumerator are disposed: this runs on startup and
        /// again on each device change, so leaked COM handles would accumulate.
        /// </summary>
        private static List<AudioDevice> GetDevices(DataFlow dataFlow)
        {
            var devices = new List<AudioDevice>();
            using var enumerator = new MMDeviceEnumerator();

            try
            {
                using var defaultDevice = enumerator.GetDefaultAudioEndpoint(dataFlow, Role.Multimedia);
                if (defaultDevice != null)
                {
                    // Add default device first with (Default)
                    var defaultDeviceName = GetCleanDeviceName(defaultDevice.FriendlyName);
                    devices.Add(new AudioDevice
                    {
                        Id = defaultDevice.ID,
                        Name = defaultDeviceName + " (Default)",
                        IsDefault = true
                    });
                }
            }
            catch
            {
                // No default device available
            }

            try
            {
                var collection = enumerator.EnumerateAudioEndPoints(dataFlow, DeviceState.Active);
                foreach (var device in collection)
                {
                    if (device == null) continue;

                    try
                    {
                        // Skip if this device is already added as the default
                        if (devices.Any(d => d.Id == device.ID)) continue;

                        var cleanName = GetCleanDeviceName(device.FriendlyName);
                        devices.Add(new AudioDevice { Id = device.ID, Name = cleanName, IsDefault = false });
                    }
                    catch
                    {
                        // Device name is invalid
                    }
                    finally
                    {
                        device.Dispose();
                    }
                }
            }
            catch
            {
                // Endpoint enumeration is unavailable; return whatever we already resolved
            }

            // Sort devices by name (keeping the default at the top if it exists)
            var defaultDev = devices.FirstOrDefault(d => d.IsDefault);
            var sortedDevices = devices
                .Where(d => !d.IsDefault)
                .OrderBy(d => d.Name)
                .ToList();

            if (defaultDev != null)
            {
                sortedDevices.Insert(0, defaultDev);
            }

            return sortedDevices;
        }

        // The output meter is polled about ten times a second for the whole life of the
        // app. Building an enumerator and resolving the default endpoint on every tick is
        // pure COM churn, so the device is held until the endpoint set changes (see
        // InvalidateDefaultOutputCache) or it stops responding.
        private static readonly object DefaultOutputLock = new();
        private static MMDeviceEnumerator? _meterEnumerator;
        private static MMDevice? _defaultOutputDevice;

        /// <summary>
        /// Drops the cached default output endpoint so the next poll re-resolves it.
        /// Call this whenever the endpoint set or the system default changes.
        /// </summary>
        public static void InvalidateDefaultOutputCache()
        {
            lock (DefaultOutputLock)
            {
                ReleaseMeterCacheLocked();
            }
        }

        private static void ReleaseMeterCacheLocked()
        {
            try { _defaultOutputDevice?.Dispose(); } catch { /* best effort */ }
            _defaultOutputDevice = null;
        }

        public static double GetDefaultOutputPeak()
        {
            lock (DefaultOutputLock)
            {
                try
                {
                    _meterEnumerator ??= new MMDeviceEnumerator();
                    _defaultOutputDevice ??= _meterEnumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                    return Math.Clamp(_defaultOutputDevice.AudioMeterInformation.MasterPeakValue, 0.0f, 1.0f);
                }
                catch
                {
                    // The endpoint (or the enumerator itself) went away between ticks.
                    // Drop both so the next poll starts from scratch.
                    ReleaseMeterCacheLocked();
                    try { _meterEnumerator?.Dispose(); } catch { /* best effort */ }
                    _meterEnumerator = null;
                    return 0;
                }
            }
        }
    }
}
