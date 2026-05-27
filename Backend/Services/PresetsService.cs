using ScreenLoop.Backend.App;
using ScreenLoop.Backend.Core.Models;
using ScreenLoop.Backend.Windows.Display;
using Serilog;

namespace ScreenLoop.Backend.Services
{
    public static class PresetsService
    {
        private static int CalculateReplayBufferMaxSizeMb(Settings settings)
        {
            int bitrateKbps = settings.RateControl == "CBR" ? settings.Bitrate : settings.MaxBitrate;
            double estimatedVideoMb = bitrateKbps * settings.ReplayBufferDuration / 8000.0;
            return Math.Max(128, (int)Math.Ceiling(estimatedVideoMb * 1.15 + 32));
        }

        private static bool IsAmdEncoder()
        {
            var codec = Settings.Instance.Codec;
            return codec != null && codec.InternalEncoderId.Contains("amf", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Applies a video quality preset to the settings
        /// </summary>
        public static async Task ApplyVideoPreset(string presetName)
        {
            var settings = Settings.Instance;
            settings.BeginBulkUpdate();
            bool isAmd = IsAmdEncoder();

            try
            {
                switch (presetName.ToLower())
                {
                    case "low":
                        settings.VideoQualityPreset = "low";
                        settings.Resolution = "720p";
                        settings.FrameRate = 30;
                        settings.RateControl = "VBR";
                        settings.CqLevel = isAmd ? 22 : 24;
                        settings.Bitrate = isAmd ? 20000 : 15000;
                        settings.MinBitrate = 10000;
                        settings.MaxBitrate = isAmd ? 20000 : 15000;
                        settings.Encoder = "gpu";
                        settings.ReplayBufferMaxSize = CalculateReplayBufferMaxSizeMb(settings);
                        break;

                    case "standard":
                        settings.VideoQualityPreset = "standard";
                        settings.Resolution = "1080p";
                        settings.FrameRate = 60;
                        settings.RateControl = "VBR";
                        settings.CqLevel = isAmd ? 20 : 22;
                        settings.Bitrate = isAmd ? 40000 : 30000;
                        settings.MinBitrate = isAmd ? 25000 : 20000;
                        settings.MaxBitrate = isAmd ? 50000 : 40000;
                        settings.Encoder = "gpu";
                        settings.ReplayBufferMaxSize = CalculateReplayBufferMaxSizeMb(settings);
                        break;

                    case "high":
                        settings.VideoQualityPreset = "high";
                        settings.Resolution = DisplayService.HasDisplayWithMinHeight(1440) ? "1440p" : "1080p";
                        settings.FrameRate = 60;
                        settings.RateControl = "VBR";
                        settings.CqLevel = isAmd ? 18 : 20;
                        settings.Bitrate = isAmd ? 60000 : 50000;
                        settings.MinBitrate = isAmd ? 45000 : 40000;
                        settings.MaxBitrate = isAmd ? 90000 : 70000;
                        settings.Encoder = "gpu";
                        settings.ReplayBufferMaxSize = CalculateReplayBufferMaxSizeMb(settings);
                        break;

                    case "custom":
                        settings.VideoQualityPreset = "custom";
                        break;

                    default:
                        Log.Warning($"Unknown video preset: {presetName}");
                        return;
                }

                Log.Information("Applied video preset '{Preset}': {Resolution}, {FrameRate}fps, {RateControl}, {Encoder}",
                    settings.VideoQualityPreset, settings.Resolution, settings.FrameRate, settings.RateControl, settings.Encoder);

                settings.EndBulkUpdateAndSaveSettings();
                await MessageService.SendSettingsToFrontend("Video preset applied");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Failed to apply video preset");
                settings.EndBulkUpdateAndSaveSettings();
            }
        }

        /// <summary>
        /// Applies a clip quality preset to the settings
        /// </summary>
        public static async Task ApplyClipPreset(string presetName)
        {
            var settings = Settings.Instance;
            settings.BeginBulkUpdate();

            try
            {
                switch (presetName.ToLower())
                {
                    case "low":
                        settings.ClipQualityPreset = "low";
                        settings.ClipEncoder = "cpu";
                        settings.ClipQualityCpu = settings.ClipCodec == "av1" ? 50 : 28;
                        settings.ClipCodec = settings.ClipCodec == "av1" ? "av1" : "h264";
                        settings.ClipResolution = "720p";
                        settings.ClipFps = 30;
                        settings.ClipAudioQuality = "96k";
                        settings.ClipAudioCodec = "opus";
                        settings.ClipPreset = settings.ClipCodec == "av1" ? "svt-10" : "ultrafast";
                        break;

                    case "standard":
                        settings.ClipQualityPreset = "standard";
                        settings.ClipEncoder = "cpu";
                        settings.ClipQualityCpu = settings.ClipCodec == "av1" ? 40 : 23;
                        settings.ClipCodec = settings.ClipCodec == "av1" ? "av1" : "h264";
                        settings.ClipResolution = "Original";
                        settings.ClipFps = 60;
                        settings.ClipAudioQuality = "128k";
                        settings.ClipAudioCodec = "opus";
                        settings.ClipPreset = settings.ClipCodec == "av1" ? "svt-6" : "veryfast";
                        break;

                    case "high":
                        settings.ClipQualityPreset = "high";
                        settings.ClipEncoder = "cpu";
                        settings.ClipQualityCpu = settings.ClipCodec == "av1" ? 30 : 20;
                        settings.ClipCodec = settings.ClipCodec == "av1" ? "av1" : "h264";
                        settings.ClipResolution = "Original";
                        settings.ClipFps = 60;
                        settings.ClipAudioQuality = "192k";
                        settings.ClipAudioCodec = "opus";
                        settings.ClipPreset = settings.ClipCodec == "av1" ? "svt-4" : "medium";
                        break;

                    case "custom":
                        settings.ClipQualityPreset = "custom";
                        break;

                    default:
                        Log.Warning($"Unknown clip preset: {presetName}");
                        return;
                }

                Log.Information("Applied clip preset '{Preset}': {Encoder}, CRF {Quality}, {Codec}, {Resolution}, {Fps}fps, {AudioCodec} {Audio} audio, {EncoderPreset}",
                    settings.ClipQualityPreset, settings.ClipEncoder, settings.ClipQualityCpu, settings.ClipCodec, settings.ClipResolution, settings.ClipFps, settings.ClipAudioCodec, settings.ClipAudioQuality, settings.ClipPreset);

                settings.EndBulkUpdateAndSaveSettings();
                await MessageService.SendSettingsToFrontend("Clip preset applied");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Failed to apply clip preset");
                settings.EndBulkUpdateAndSaveSettings();
            }
        }
    }
}
