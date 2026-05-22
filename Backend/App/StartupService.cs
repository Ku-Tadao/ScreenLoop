using System.Reflection;
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
                return File.Exists(linkPath);
            }
            catch (Exception ex)
            {
                Log.Error(ex.Message);
                return false;
            }
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
