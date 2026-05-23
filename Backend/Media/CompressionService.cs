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
                string tempOutputPath = PathUtils.Combine(directory, $"{fileName}_temp_compressed{extension}");

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
                        ? $"-preset {MapSvtAv1Preset(Settings.Instance.ClipPreset)}"
                        : $"-preset {Settings.Instance.ClipPreset}";
                }
                else
                {
                    videoCodec = "libx264";
                    qualityArgs = "-crf 23";
                    presetArgs = "-preset veryfast";
                }

                string scaleFilter = GetClipScaleFilter(Settings.Instance.ClipResolution);
                string videoFilterArgs = string.IsNullOrWhiteSpace(scaleFilter) ? "" : $"-vf {scaleFilter} ";
                string audioCodecArgs = GetAudioCodecArgs();
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
                string? game = originalContent.Game;

                string finalPath;
                if (Settings.Instance.RemoveOriginalAfterCompression)
                {
                    finalPath = PathUtils.Combine(directory, $"{fileName}_compressed{extension}");
                    if (File.Exists(finalPath)) File.Delete(finalPath);
                    File.Move(tempOutputPath, finalPath);

                    Log.Information($"Replaced original with compressed file: {finalPath}");
                    await ContentService.CreateMetadataFile(finalPath, contentType, game ?? "Unknown", originalContent?.Bookmarks, originalContent?.Title, originalContent?.CreatedAt, originalContent?.IgdbId, isImported: originalContent?.IsImported ?? false, audioTrackNames: originalContent?.AudioTrackNames, isFavorite: true);
                    await ContentService.CreateThumbnail(finalPath, contentType);
                    await ContentService.CreateWaveformFile(finalPath, contentType);

                    await Task.Delay(500);
                    await ContentService.DeleteContent(filePath, contentType, false);
                }
                else
                {
                    finalPath = PathUtils.Combine(directory, $"{fileName}_compressed{extension}");
                    if (File.Exists(finalPath)) File.Delete(finalPath);
                    File.Move(tempOutputPath, finalPath);
                    Log.Information($"Saved compressed file as: {finalPath}");

                    await ContentService.CreateMetadataFile(finalPath, contentType, game ?? "Unknown", originalContent?.Bookmarks, originalContent?.Title, originalContent?.CreatedAt, originalContent?.IgdbId, isImported: originalContent?.IsImported ?? false, audioTrackNames: originalContent?.AudioTrackNames, isFavorite: true);
                    await ContentService.CreateThumbnail(finalPath, contentType);
                    await ContentService.CreateWaveformFile(finalPath, contentType);
                }
                await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = 100, status = "done" });
                await SettingsService.LoadContentFromFolderIntoState();
            }
            catch (Exception ex)
            {
                Log.Error(ex, $"Error compressing video: {filePath}");
                await MessageService.SendFrontendMessage("CompressionProgress", new { filePath, progress = -1, status = "error", message = ex.Message });
            }
        }

        private static int MapSvtAv1Preset(string preset)
        {
            return preset.ToLowerInvariant() switch
            {
                "svt-4" => 4,
                "svt-5" => 5,
                "svt-6" => 6,
                "svt-7" => 7,
                "svt-8" => 8,
                "svt-9" => 9,
                "svt-10" => 10,
                "svt-11" => 11,
                "svt-12" => 12,
                "svt-13" => 13,
                "veryslow" => 2,
                "slower" => 3,
                "slow" => 4,
                "medium" => 6,
                "fast" => 8,
                "faster" => 9,
                "veryfast" => 10,
                "superfast" => 11,
                "ultrafast" => 12,
                _ => 8
            };
        }

        private static string GetAudioCodecArgs()
        {
            string codec = Settings.Instance.ClipAudioCodec.Equals("opus", StringComparison.OrdinalIgnoreCase)
                ? "libopus"
                : "aac";

            return $"-c:a {codec} -b:a {Settings.Instance.ClipAudioQuality}";
        }

        private static string GetClipScaleFilter(string clipResolution)
        {
            return clipResolution.ToLowerInvariant() switch
            {
                "480p" => "scale=-2:480",
                "720p" => "scale=-2:720",
                "1080p" => "scale=-2:1080",
                "1440p" => "scale=-2:1440",
                "4k" => "scale=-2:2160",
                _ => ""
            };
        }
    }
}
