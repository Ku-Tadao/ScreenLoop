using ScreenLoop.Backend.Core.Models;
using System.Diagnostics;
using System.Reflection;
using System.Security;
using System.Security.Principal;
using System.Text;
using Serilog;

namespace ScreenLoop.Backend.App
{
    internal static class StartupService
    {
        public static void SetStartupStatus(bool enable)
        {
            try
            {
                string? exePath = ResolveStartupExecutablePath();
                if (string.IsNullOrWhiteSpace(exePath))
                {
                    Log.Error("Failed to get executable path");
                    return;
                }
                string startupFolder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                string linkPath = Path.Combine(startupFolder, "ScreenLoop.lnk");

                // Windows skips elevated apps in the Startup folder, so "Run as administrator" starts
                // through a scheduled task instead. Creating or removing that task itself needs admin.
                if (Settings.Instance.RunAsAdmin)
                {
                    if (!ElevationService.IsElevated)
                    {
                        Log.Warning("Not elevated; leaving the elevated startup task as it is");
                        return;
                    }

                    if (enable)
                    {
                        CreateStartupTask(exePath);
                        if (File.Exists(linkPath))
                            File.Delete(linkPath);
                    }
                    else
                    {
                        DeleteStartupTask();
                    }
                    return;
                }

                if (ElevationService.IsElevated)
                {
                    DeleteStartupTask();
                }

                if (enable)
                {
                    Type shellType = Type.GetTypeFromProgID("WScript.Shell")!;
                    object shell = Activator.CreateInstance(shellType)!;
                    object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { linkPath })!;
                    shortcut.GetType().InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { exePath });
                    shortcut.GetType().InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { "--from-startup" });
                    string? workingDir = Path.GetDirectoryName(exePath);
                    if (workingDir == null)
                    {
                        Log.Error("Failed to get working directory");
                        return;
                    }
                    shortcut.GetType().InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                    shortcut.GetType().InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
                    Log.Information("Added or repaired ScreenLoop startup shortcut: {ExePath}", exePath);
                }
                else if (!enable && File.Exists(linkPath))
                {
                    File.Delete(linkPath);
                    Log.Information("Removed ScreenLoop from startup");
                }
            }
            catch (Exception ex)
            {
                Log.Error(ex.Message);
            }
        }

        public static bool GetStartupStatus()
        {
            try
            {
                string linkPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "ScreenLoop.lnk");
                return File.Exists(linkPath) || RunSchtasks($"/Query /TN \"{StartupTaskName}\"");
            }
            catch (Exception ex)
            {
                Log.Error(ex.Message);
                return false;
            }
        }

        private static string StartupTaskName => $"ScreenLoop ({Environment.UserName})";

        private static void CreateStartupTask(string exePath)
        {
            string user = SecurityElement.Escape(WindowsIdentity.GetCurrent().Name);
            // A plain schtasks /Create would add a 3-day run limit and stop the app on battery.
            string xml = $"""
                <?xml version="1.0" encoding="UTF-16"?>
                <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
                  <Triggers>
                    <LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger>
                  </Triggers>
                  <Principals>
                    <Principal id="Author">
                      <UserId>{user}</UserId>
                      <LogonType>InteractiveToken</LogonType>
                      <RunLevel>HighestAvailable</RunLevel>
                    </Principal>
                  </Principals>
                  <Settings>
                    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                    <Priority>7</Priority>
                  </Settings>
                  <Actions Context="Author">
                    <Exec>
                      <Command>{SecurityElement.Escape(exePath)}</Command>
                      <Arguments>--from-startup</Arguments>
                      <WorkingDirectory>{SecurityElement.Escape(Path.GetDirectoryName(exePath))}</WorkingDirectory>
                    </Exec>
                  </Actions>
                </Task>
                """;

            string xmlPath = Path.Combine(Path.GetTempPath(), "screenloop-startup-task.xml");
            File.WriteAllText(xmlPath, xml, Encoding.Unicode);
            try
            {
                if (RunSchtasks($"/Create /F /TN \"{StartupTaskName}\" /XML \"{xmlPath}\""))
                    Log.Information("Added or repaired elevated ScreenLoop startup task: {ExePath}", exePath);
                else
                    Log.Error("Failed to create elevated startup task");
            }
            finally
            {
                File.Delete(xmlPath);
            }
        }

        private static void DeleteStartupTask()
        {
            if (RunSchtasks($"/Query /TN \"{StartupTaskName}\"") && RunSchtasks($"/Delete /F /TN \"{StartupTaskName}\""))
                Log.Information("Removed elevated ScreenLoop startup task");
        }

        private static bool RunSchtasks(string arguments)
        {
            using var process = Process.Start(new ProcessStartInfo("schtasks.exe", arguments)
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            })!;
            process.StandardOutput.ReadToEnd();
            process.StandardError.ReadToEnd();
            process.WaitForExit();
            return process.ExitCode == 0;
        }

        private static string? ResolveStartupExecutablePath()
        {
            string installedExePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ScreenLoop",
                "current",
                "ScreenLoop.exe");

            if (File.Exists(installedExePath))
            {
                return installedExePath;
            }

            return Path.ChangeExtension(Assembly.GetExecutingAssembly().Location, ".exe");
        }
    }
}
