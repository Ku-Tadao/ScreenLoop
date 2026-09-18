$ErrorActionPreference = 'Stop'
# Compile the real argument builder in isolation; no app startup or settings writes.
$checkDir = Join-Path ([IO.Path]::GetTempPath()) ('screenloop-encoding-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $checkDir | Out-Null
$sourcePath = [Security.SecurityElement]::Escape((Join-Path $PSScriptRoot '../Backend/Media/EncodingArgs.cs'))
@"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup>
  <ItemGroup><Compile Include="$sourcePath" Link="EncodingArgs.cs" /></ItemGroup>
</Project>
"@ | Set-Content (Join-Path $checkDir 'Check.csproj')
@'
using ScreenLoop.Backend.Media;
using ScreenLoop.Backend.Core.Models;
using static ScreenLoop.Backend.Utils.GeneralUtils;

var settings = new Settings { ClipCodec = "av1", ClipPreset = "svt-6", ClipEncoder = "cpu", ClipQualityCpu = 30 };
void Check(string expected) {
    var actual = EncodingArgs.GetVideoCodecArgs(settings, GpuVendor.Nvidia);
    if (actual != expected) throw new Exception($"Expected {expected}; got {actual}");
}
Check("-c:v libsvtav1 -preset 6 -crf 30");
settings.ClipEncoder = "gpu";
Check("-c:v av1_nvenc -preset p4 -rc vbr -cq 23 -b:v 0");
settings.ClipVideoBitrate = 800;
Check("-c:v av1_nvenc -preset p4 -rc vbr -b:v 800k");
settings.ClipPreset = "quality";
var amd = EncodingArgs.GetVideoCodecArgs(settings, GpuVendor.AMD);
if (!amd.Contains("-usage transcoding -quality quality -rc vbr_peak -b:v 800k")) throw new Exception(amd);
settings.ClipVideoBitrate = 0;
var fallback = EncodingArgs.GetVideoCodecArgs(settings, GpuVendor.Unknown);
if (!fallback.StartsWith("-c:v libsvtav1 -preset 8 -crf 30")) throw new Exception(fallback);
settings.ClipEncoder = "cpu";
settings.ClipCodec = "h264";
settings.ClipQualityCpu = 63;
Check("-c:v libx264 -preset veryfast -crf 51");
foreach (var codec in new[] { "h264", "h265", "av1" })
foreach (var vendor in Enum.GetValues<GpuVendor>()) {
    settings.ClipEncoder = "gpu";
    settings.ClipCodec = codec;
    settings.ClipPreset = "svt-6";
    var arguments = EncodingArgs.GetVideoCodecArgs(settings, vendor);
    if (arguments.Contains("svt-")) throw new Exception(arguments);
}
Console.WriteLine("Encoding regressions passed (CPU, NVIDIA, AMD, Intel, and unknown-hardware fallback).");

namespace ScreenLoop.Backend.Core.Models {
    public class Settings {
        public string ClipCodec { get; set; } = "h264";
        public string ClipEncoder { get; set; } = "cpu";
        public string ClipPreset { get; set; } = "veryfast";
        public int ClipVideoBitrate { get; set; }
        public int ClipQualityCpu { get; set; } = 23;
        public int ClipQualityGpu { get; set; } = 23;
        public string ClipAudioCodec { get; set; } = "aac";
        public string ClipAudioQuality { get; set; } = "128k";
    }
}
namespace ScreenLoop.Backend.Utils {
    public static class GeneralUtils {
        public enum GpuVendor { Unknown, Nvidia, AMD, Intel }
    }
}
'@ | Set-Content (Join-Path $checkDir 'Program.cs')
dotnet run --project (Join-Path $checkDir 'Check.csproj')
if ($LASTEXITCODE -ne 0) { throw 'Encoding regression check failed.' }
