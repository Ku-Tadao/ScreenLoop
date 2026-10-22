using Microsoft.Win32;
using ScreenLoop.Backend.Core.Models;
using ScreenLoop.Backend.Recorder;
using Serilog;

namespace ScreenLoop.Backend.Windows.Power
{
    internal static class PowerModeMonitor
    {
        private static bool _isMonitoring = false;
        private static bool _wasRecordingBeforeSuspend = false;

        public static void StartMonitoring()
        {
            if (_isMonitoring)
            {
                Log.Warning("PowerModeMonitor is already running");
                return;
            }

            SystemEvents.PowerModeChanged += OnPowerModeChanged;
            _isMonitoring = true;
        }

        public static void StopMonitoring()
        {
            if (!_isMonitoring)
                return;

            SystemEvents.PowerModeChanged -= OnPowerModeChanged;
            _isMonitoring = false;
        }

        private static void OnPowerModeChanged(object sender, PowerModeChangedEventArgs e)
        {
            switch (e.Mode)
            {
                case PowerModes.Resume:
                    Log.Information("Power Mode: RESUME - System woke up from sleep/hibernation");
                    _ = Task.Run(RestartRecordingAfterResume);
                    break;
                case PowerModes.Suspend:
                    Log.Information("Power Mode: SUSPEND - System is entering sleep/hibernation");
                    // The capture's D3D device and the hardware encoder don't survive sleep, so a
                    // replay buffer left running comes back frozen or dead. Stop it cleanly now.
                    _wasRecordingBeforeSuspend = AppState.Instance.Recording != null || AppState.Instance.PreRecording != null;
                    if (_wasRecordingBeforeSuspend)
                        OBSService.StopRecording().GetAwaiter().GetResult();
                    break;
                default:
                    break;
            }
        }

        private static async Task RestartRecordingAfterResume()
        {
            // Windows may suspend before the stop finished; this finishes it (no-op if already stopped).
            await OBSService.StopRecording();

            if (!_wasRecordingBeforeSuspend && !Settings.Instance.AlwaysRecord)
                return;
            _wasRecordingBeforeSuspend = false;

            // Give the GPU driver and displays a moment to come back before recreating the capture.
            await Task.Delay(5000);

            if (OBSService.IsInitialized && AppState.Instance.Recording == null && AppState.Instance.PreRecording == null)
            {
                Log.Information("Restarting recording after resume");
                OBSService.StartRecording();
            }
        }
    }
}
