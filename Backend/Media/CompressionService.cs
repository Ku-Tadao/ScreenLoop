using Serilog;
using ScreenLoop.Backend.Core.Models;
using ScreenLoop.Backend.Services;
using ScreenLoop.Backend.Shared;
using ScreenLoop.Backend.App;

namespace ScreenLoop.Backend.Media
{
    internal static class CompressionService
    {
        public static async Task CompressVideo(string filePath)
        {
            int processId = Guid.NewGuid().GetHashCode();
            string? tempOutputPath = null;
            string? createdOutputPath = null;
            Content.ContentType? createdOutputType = null;

            try
            {
                if (!File.Exists(filePath))
                {
                    Log.Error($"File not found for compression: {filePath}");
                    return;
                }

                long originalSize = new FileInfo(filePath).Length;
                string directory = PathUtils.Normalize(Path.GetDirectoryName(filePath)!);
                string fileName = Path.GetFileNameWithoutExtension(filePath);
                string extension = Path.GetExtension(filePath);
                tempOutputPath = PathUtils.Combine(directory, $"{fileName}_temp_compressed{extension}");

                TimeSpan durationTs = await FFmpegService.GetVideoDuration(filePath);
                double? duration = durationTs.TotalSeconds > 0 ? durationTs.TotalSeconds : null;

                Log.Information($"Starting compression for: {filePath} (Original size: {originalSize / 1024 / 1024}MB)");
                await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = 0, status = "compressing" });

                string videoCodec;
                string qualityArgs;
                string presetArgs;

                if (Settings.Instance.ClipEncoder.Equals("cpu", StringComparison.OrdinalIgnoreCase))
                {
                    if (Settings.Instance.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                        videoCodec = "libx265";
                    else if (Settings.Instance.ClipCodec.Equals("av1", StringComparison.OrdinalIgnoreCase))
                        videoCodec = "libsvtav1";
                    else
                        videoCodec = "libx264";

                    qualityArgs = $"-crf {Settings.Instance.ClipQualityCpu}";
                    presetArgs = videoCodec.Equals("libsvtav1", StringComparison.OrdinalIgnoreCase)
                        ? $"-preset {EncodingArgs.MapSvtAv1Preset(Settings.Instance.ClipPreset)}"
                        : $"-preset {Settings.Instance.ClipPreset}";
                }
                else
                {
                    videoCodec = "libx264";
                    qualityArgs = "-crf 23";
                    presetArgs = "-preset veryfast";
                }

                string scaleFilter = EncodingArgs.GetScaleFilter(Settings.Instance.ClipResolution);
                string videoFilterArgs = string.IsNullOrWhiteSpace(scaleFilter) ? "" : $"-vf {scaleFilter} ";
                string audioCodecArgs = EncodingArgs.GetAudioCodecArgs(Settings.Instance);
                string arguments = $"-y -i \"{filePath}\" {videoFilterArgs}-c:v {videoCodec} {presetArgs} {qualityArgs} {audioCodecArgs} -movflags +faststart \"{tempOutputPath}\"";

                await FFmpegService.RunWithProgress(processId, arguments, duration, (progress) =>
                {
                    _ = MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = (int)(progress * 100), status = "compressing" });
                });

                if (!File.Exists(tempOutputPath))
                {
                    Log.Error($"Compression failed for: {filePath}");
                    await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = -1, status = "error", message = "Compression failed" });
                    return;
                }

                long compressedSize = new FileInfo(tempOutputPath).Length;
                Log.Information($"Compression complete. Original: {originalSize / 1024 / 1024}MB, Compressed: {compressedSize / 1024 / 1024}MB");

                if (compressedSize >= originalSize)
                {
                    Log.Information($"Compressed file is not smaller than original, keeping original");
                    File.Delete(tempOutputPath);
                    await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = 100, status = "skipped", message = "Compressed file was not smaller" });
                    return;
                }

                Content? originalContent = AppState.Instance.Content.FirstOrDefault(c => c.FilePath == filePath);
                if (originalContent == null)
                {
                    Log.Error($"Content not found in metadata for file: {filePath}");
                    await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = -1, status = "error", message = "Content not found in metadata" });
                    return;
                }

                Content.ContentType contentType = originalContent.Type;
                createdOutputType = contentType;
                string? game = originalContent.Game;

                string finalPath;
                if (Settings.Instance.RemoveOriginalAfterCompression)
                {
                    finalPath = GetAvailableOutputPath(directory, fileName, extension);
                    File.Move(tempOutputPath, finalPath);
                    createdOutputPath = finalPath;

                    Log.Information($"Replaced original with compressed file: {finalPath}");
                    await ContentService.CreateMetadataFile(finalPath, contentType, game ?? "Unknown", originalContent?.Bookmarks, originalContent?.Title, originalContent?.CreatedAt, originalContent?.IgdbId, isImported: originalContent?.IsImported ?? false, audioTrackNames: originalContent?.AudioTrackNames, isFavorite: originalContent?.IsFavorite ?? false);
                    await ContentService.CreateThumbnail(finalPath, contentType);
                    await ContentService.CreateWaveformFile(finalPath, contentType);

                    await Task.Delay(500);
                    await ContentService.DeleteContent(filePath, contentType, false);
                    // The replacement is complete once its sidecars exist and the old
                    // file deletion has been attempted. Later UI/state refresh failures
                    // must never erase the only remaining playable copy.
                    createdOutputPath = null;
                }
                else
                {
                    finalPath = GetAvailableOutputPath(directory, fileName, extension);
                    File.Move(tempOutputPath, finalPath);
                    createdOutputPath = finalPath;
                    Log.Information($"Saved compressed file as: {finalPath}");

                    await ContentService.CreateMetadataFile(finalPath, contentType, game ?? "Unknown", originalContent?.Bookmarks, originalContent?.Title, originalContent?.CreatedAt, originalContent?.IgdbId, isImported: originalContent?.IsImported ?? false, audioTrackNames: originalContent?.AudioTrackNames, isFavorite: originalContent?.IsFavorite ?? false);
                    await ContentService.CreateThumbnail(finalPath, contentType);
                    await ContentService.CreateWaveformFile(finalPath, contentType);
                    createdOutputPath = null;
                }
                await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = 100, status = "done" });
                await SettingsService.LoadContentFromFolderIntoState();
            }
            catch (Exception ex)
            {
                Log.Error(ex, $"Error compressing video: {filePath}");

                if (!string.IsNullOrEmpty(createdOutputPath) && createdOutputType.HasValue)
                {
                    await ContentService.DeleteContent(createdOutputPath, createdOutputType.Value, sendToFrontend: false);
                }

                await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = -1, status = "error", message = ex.Message });
            }
            finally
            {
                if (!string.IsNullOrEmpty(tempOutputPath) && File.Exists(tempOutputPath))
                {
                    try
                    {
                        File.Delete(tempOutputPath);
                    }
                    catch (Exception cleanupEx)
                    {
                        Log.Warning(cleanupEx, "Failed to clean up compression temp file {FilePath}", tempOutputPath);
                    }
                }
            }
        }

        private static string GetAvailableOutputPath(string directory, string fileName, string extension)
        {
            string outputPath = PathUtils.Combine(directory, $"{fileName}_compressed{extension}");
            int suffix = 1;
            while (File.Exists(outputPath))
            {
                outputPath = PathUtils.Combine(directory, $"{fileName}_compressed_{suffix}{extension}");
                suffix++;
            }
            return outputPath;
        }

    }
}
