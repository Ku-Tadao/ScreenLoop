using ScreenLoop.Backend.Core.Models;
using static ScreenLoop.Backend.Utils.GeneralUtils;

namespace ScreenLoop.Backend.Media
{
    /// <summary>
    /// FFmpeg argument fragments shared by clip creation and compression, so both paths
    /// stay in sync when a preset, codec, or scaling option changes.
    /// </summary>
    internal static class EncodingArgs
    {
        public static string GetVideoCodecArgs(Settings settings, GpuVendor gpuVendor)
        {
            string codec = settings.ClipCodec.ToLowerInvariant();
            string preset = settings.ClipPreset.ToLowerInvariant();
            bool targetBitrate = settings.ClipVideoBitrate > 0;
            string bitrate = targetBitrate ? $"-b:v {Math.Clamp(settings.ClipVideoBitrate, 100, 100000)}k" : "";
            int gpuQuality = Math.Clamp(settings.ClipQualityGpu, 0, 51);
            string hardwareCodec = codec switch { "av1" => "av1", "h265" => "hevc", _ => "h264" };

            if (settings.ClipEncoder.Equals("gpu", StringComparison.OrdinalIgnoreCase))
            {
                switch (gpuVendor)
                {
                    case GpuVendor.Nvidia:
                        string[] nvencPresets = codec == "av1"
                            ? ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]
                            : ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "slow", "medium", "fast", "hp", "hq", "bd", "ll", "llhq", "llhp", "lossless", "losslesshp"];
                        if (!nvencPresets.Contains(preset)) preset = "p4";
                        return $"-c:v {hardwareCodec}_nvenc -preset {preset} -rc vbr " +
                            (targetBitrate ? bitrate : $"-cq {gpuQuality} -b:v 0");
                    case GpuVendor.AMD:
                        // 'quality' is a quality preset, not an AMF usage mode.
                        string mode = preset == "quality" ? "-usage transcoding -quality quality"
                            : $"-usage {(preset is "transcoding" or "lowlatency" or "ultralowlatency" ? preset : "transcoding")}";
                        return $"-c:v {hardwareCodec}_amf {mode} " +
                            (targetBitrate ? $"-rc vbr_peak {bitrate}" : $"-rc cqp -qp_i {gpuQuality} -qp_p {gpuQuality}");
                    case GpuVendor.Intel:
                        if (preset is not ("fast" or "medium" or "slow")) preset = "medium";
                        return $"-c:v {hardwareCodec}_qsv -preset {preset} " +
                            (targetBitrate ? bitrate : $"-global_quality {Math.Max(1, gpuQuality)}");
                }
            }

            // Unknown hardware falls back to the requested codec's software encoder.
            string cpuCodec = codec switch { "av1" => "libsvtav1", "h265" => "libx265", _ => "libx264" };
            string[] cpuPresets = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"];
            preset = codec == "av1" ? MapSvtAv1Preset(preset).ToString()
                : cpuPresets.Contains(preset) ? preset : "veryfast";
            int cpuQuality = Math.Clamp(settings.ClipQualityCpu, 0, codec == "av1" ? 63 : 51);
            return $"-c:v {cpuCodec} -preset {preset} " + (targetBitrate ? bitrate : $"-crf {cpuQuality}");
        }

        /// <summary>
        /// Maps a UI preset name onto SVT-AV1's numeric preset scale (lower = slower/better).
        /// </summary>
        public static int MapSvtAv1Preset(string preset)
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

        public static string GetAudioCodecArgs(Settings settings)
        {
            string codec = settings.ClipAudioCodec.Equals("opus", StringComparison.OrdinalIgnoreCase)
                ? "libopus"
                : "aac";

            return $"-c:a {codec} -b:a {settings.ClipAudioQuality}";
        }

        /// <summary>
        /// Returns the scale filter for a clip resolution, or an empty string to keep the source size.
        /// </summary>
        public static string GetScaleFilter(string clipResolution)
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
