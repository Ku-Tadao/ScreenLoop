using ScreenLoop.Backend.Core.Models;

namespace ScreenLoop.Backend.Media
{
    /// <summary>
    /// FFmpeg argument fragments shared by clip creation and compression, so both paths
    /// stay in sync when a preset, codec, or scaling option changes.
    /// </summary>
    internal static class EncodingArgs
    {
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
