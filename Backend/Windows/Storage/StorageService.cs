using ScreenLoop.Backend.Core.Models;
using ScreenLoop.Backend.Media;
using ScreenLoop.Backend.Services;
using ScreenLoop.Backend.Shared;
using Serilog;

namespace ScreenLoop.Backend.Windows.Storage
{
    internal class StorageService
    {
        public const long BYTES_PER_GB = 1073741824; // 1024 * 1024 * 1024
        private const double STORAGE_LIMIT_HEADROOM_PERCENT = 0.20;

        public static string SanitizeGameNameForFolder(string gameName)
        {
            if (string.IsNullOrWhiteSpace(gameName))
                return "Unknown";

            char[] invalidChars = Path.GetInvalidFileNameChars();
            string sanitized = new string(gameName
                .Select(c => invalidChars.Contains(c) ? '_' : c)
                .ToArray());

            sanitized = sanitized.Trim().Trim('.');

            while (sanitized.Contains("__"))
                sanitized = sanitized.Replace("__", "_");

            return string.IsNullOrWhiteSpace(sanitized) ? "Unknown" : sanitized;
        }

        public static double GetCurrentFolderSizeGb()
        {
            string contentFolder = Settings.Instance.ContentFolder;
            if (string.IsNullOrEmpty(contentFolder) || !Directory.Exists(contentFolder))
            {
                return 0;
            }

            long currentUsageBytes = CalculateFolderSize(contentFolder);
            double currentUsageGb = Math.Round((double)currentUsageBytes / BYTES_PER_GB, 2);
            return currentUsageGb;
        }

        public static void UpdateFolderSizeInState()
        {
            double currentSizeGb = GetCurrentFolderSizeGb();
            AppState.Instance.CurrentFolderSizeGb = currentSizeGb;

            (double freeGb, double totalGb) = GetContentDriveSpaceGb();
            AppState.Instance.ContentDriveFreeGb = freeGb;
            AppState.Instance.ContentDriveTotalGb = totalGb;

            Log.Information($"Updated folder size in state: {currentSizeGb:F2} GB, drive free: {freeGb:F2} GB, drive total: {totalGb:F2} GB");
        }

        public static (double FreeGb, double TotalGb) GetContentDriveSpaceGb()
        {
            string contentFolder = Settings.Instance.ContentFolder;
            if (string.IsNullOrWhiteSpace(contentFolder))
            {
                return (0, 0);
            }

            try
            {
                string? root = Path.GetPathRoot(Path.GetFullPath(contentFolder));
                if (string.IsNullOrWhiteSpace(root))
                {
                    return (0, 0);
                }

                var drive = new DriveInfo(root);
                if (!drive.IsReady)
                {
                    return (0, 0);
                }

                return (
                    Math.Round(drive.AvailableFreeSpace / (double)BYTES_PER_GB, 2),
                    Math.Round(drive.TotalSize / (double)BYTES_PER_GB, 2)
                );
            }
            catch (Exception ex)
            {
                Log.Warning($"Could not read content drive space: {ex.Message}");
                return (0, 0);
            }
        }

        public static async Task EnsureStorageBelowLimit()
        {
            Log.Information("Starting storage limit check");
            long storageLimit = Settings.Instance.StorageLimit; // This is in GB
            string contentFolder = Settings.Instance.ContentFolder;

            long currentUsageBytes = CalculateFolderSize(contentFolder);
            double currentUsageGB = (double)currentUsageBytes / BYTES_PER_GB;
            (double freeGb, double totalGb) = GetContentDriveSpaceGb();
            long storageLimitBytes = storageLimit * BYTES_PER_GB;
            long storageHeadroomBytes = (long)(storageLimitBytes * STORAGE_LIMIT_HEADROOM_PERCENT);
            long storageCleanupStartBytes = storageLimitBytes - storageHeadroomBytes;
            long spaceToFreeBytes = Math.Max(0, currentUsageBytes - storageCleanupStartBytes);

            Log.Information($"Current storage usage: {currentUsageGB:F2} GB, limit: {storageLimit} GB, drive free: {freeGb:F2} GB / {totalGb:F2} GB");

            if (spaceToFreeBytes > 0)
            {
                double cleanupStartGB = storageCleanupStartBytes / (double)BYTES_PER_GB;
                double neededGB = spaceToFreeBytes / (double)BYTES_PER_GB;
                Log.Information($"Storage usage is above the 80% auto-manage threshold ({cleanupStartGB:F2} GB), cleanup needs {neededGB:F2} GB");
                await DeleteOldestContent(contentFolder, spaceToFreeBytes);
            }
            else
            {
                Log.Information("Storage usage is below the auto-manage threshold, no cleanup needed");
            }
        }

        private static long CalculateFolderSize(string folderPath)
        {
            long size = 0;
            string[] files = Directory.GetFiles(folderPath, "*", SearchOption.AllDirectories);

            foreach (string file in files)
            {
                FileInfo fileInfo = new FileInfo(file);
                try
                {
                    size += fileInfo.Length;
                }
                catch (Exception ex)
                {
                    Log.Warning($"Error calculating size for file {PathUtils.Normalize(file)}: {ex.Message}");
                }
            }

            return size;
        }

        private static async Task DeleteOldestContent(string contentFolder, long spaceToFreeBytes)
        {
            double spaceToFreeGB = (double)spaceToFreeBytes / BYTES_PER_GB;

            // Do not delete files older than 1 hour since they are likely still in use
            DateTime oneHourAgo = DateTime.Now.AddHours(-1);
            await SettingsService.LoadContentFromFolderIntoState(false);

            var deletionCandidates = AppState.Instance.Content
                .Where(content =>
                    content.Type != Content.ContentType.Highlight &&
                    !content.IsImported &&
                    !content.IsFavorite &&
                    !string.IsNullOrWhiteSpace(content.FilePath) &&
                    File.Exists(content.FilePath))
                .Select(content => new { Content = content, File = new FileInfo(content.FilePath) })
                .Where(item => item.File.LastWriteTime < oneHourAgo)
                .OrderBy(item => item.Content.CreatedAt)
                .ToList();

            Log.Information($"Total ScreenLoop-owned files eligible for auto-manage deletion: {deletionCandidates.Count}");

            long freedSpaceBytes = 0;
            int deletedCount = 0;

            foreach (var candidate in deletionCandidates)
            {
                if (freedSpaceBytes >= spaceToFreeBytes)
                    break;

                FileInfo file = candidate.File;
                string fileFullName = PathUtils.Normalize(file.FullName);
                long fileSize = file.Length;
                double fileSizeMB = (double)fileSize / (1024 * 1024);

                try
                {
                    Log.Information($"Auto-manage deleting {candidate.Content.Type} file: {fileFullName} ({fileSizeMB:F2} MB)");
                    await ContentService.DeleteContent(fileFullName, candidate.Content.Type);

                    // DeleteContent reports user-facing errors internally, so verify the
                    // destructive operation before claiming space was reclaimed.
                    if (File.Exists(fileFullName))
                    {
                        Log.Warning("Auto-manage could not delete {FilePath}; leaving it out of the reclaimed-space total", fileFullName);
                        continue;
                    }

                    freedSpaceBytes += fileSize;
                    deletedCount++;

                    double freedSpaceGB = (double)freedSpaceBytes / BYTES_PER_GB;
                    Log.Information($"Successfully deleted file, freed space so far: {freedSpaceGB:F2} GB");
                }
                catch (Exception ex)
                {
                    Log.Error($"Error deleting file {fileFullName}: {ex.Message}");
                }
            }

            double totalFreedGB = (double)freedSpaceBytes / BYTES_PER_GB;
            Log.Information($"Storage cleanup completed: {deletedCount} files deleted, {totalFreedGB:F2} GB freed");

            if (freedSpaceBytes < spaceToFreeBytes)
            {
                double stillNeededGB = (double)(spaceToFreeBytes - freedSpaceBytes) / BYTES_PER_GB;
                Log.Information($"Warning: Could not free enough space. Still needed: {stillNeededGB:F2} GB");
            }
        }
    }
}
