using ScreenLoop.Backend.Services;
using Serilog;
using System.ComponentModel;
using System.Diagnostics;
using System.Security.Principal;
using System.Text.Json;

namespace ScreenLoop.Backend.App
{
    // Games that run elevated (e.g. League via WeGame/ACE) hide their keyboard input from
    // non-elevated processes (UIPI), so hotkeys only work in them when ScreenLoop is elevated too.
    internal static class ElevationService
    {
        public const string RelaunchArg = "--relaunch";
        private const int ERROR_CANCELLED = 1223; // user declined the UAC prompt

        public static readonly bool IsElevated =
            new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);

        // Read before settings (and logging) are loaded, so an elevated relaunch happens
        // before this instance grabs the single-instance mutex, ports and hooks.
        public static bool IsRequestedInSettingsFile()
        {
            try
            {
                if (!File.Exists(SettingsService.SettingsFilePath))
                    return false;

                using var doc = JsonDocument.Parse(File.ReadAllText(SettingsService.SettingsFilePath));
                return doc.RootElement.TryGetProperty("runAsAdmin", out var value) && value.ValueKind == JsonValueKind.True;
            }
            catch
            {
                return false;
            }
        }

        // Starts an elevated copy of this exe. Returns false if the user declined UAC or the start failed.
        public static void WaitForRelaunchParent(string[] args)
        {
            string? arg = args.FirstOrDefault(a => a.StartsWith(RelaunchArg + "="));
            if (arg == null || !int.TryParse(arg[(RelaunchArg.Length + 1)..], out int pid))
                return;

            try
            {
                using var parent = Process.GetProcessById(pid);
                parent.WaitForExit(TimeSpan.FromSeconds(30));
            }
            catch (ArgumentException)
            {
                // Already gone.
            }
        }

        public static bool TryRelaunchElevated()
        {
            // Pass our PID so the elevated copy waits for this process to fully exit (files, ports, mutex).
            var args = Environment.GetCommandLineArgs().Skip(1).Where(a => !a.StartsWith(RelaunchArg)).Append($"{RelaunchArg}={Environment.ProcessId}");
            var startInfo = new ProcessStartInfo(Environment.ProcessPath!)
            {
                UseShellExecute = true,
                Verb = "runas",
                WorkingDirectory = AppContext.BaseDirectory,
                Arguments = string.Join(" ", args), // only plain flags like --from-startup
            };

            try
            {
                Process.Start(startInfo);
                return true;
            }
            catch (Win32Exception ex) when (ex.NativeErrorCode == ERROR_CANCELLED)
            {
                Log.Information("Elevated relaunch declined at the UAC prompt");
                return false;
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Elevated relaunch failed");
                return false;
            }
        }
    }
}
