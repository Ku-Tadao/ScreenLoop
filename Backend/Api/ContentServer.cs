using Serilog;
using System.Net;
using System.Web;
using ScreenLoop.Backend.Core.Models;
using ScreenLoop.Backend.Media;
using ScreenLoop.Backend.Shared;

namespace ScreenLoop.Backend.Api
{
    internal class ContentServer
    {
        private static readonly HttpListener _httpListener = new();
        private static CancellationTokenSource? _cancellationTokenSource;
        private static string? _trustedOrigin;

        public static void ConfigureTrustedOrigin(string appUrl)
        {
            if (!Uri.TryCreate(appUrl, UriKind.Absolute, out var uri))
                throw new ArgumentException("The app URL must be absolute.", nameof(appUrl));

            _trustedOrigin = uri.GetLeftPart(UriPartial.Authority);
        }

        public static void StartServer(string prefix)
        {
            _httpListener.Prefixes.Add(prefix);
            _httpListener.Start();
            Log.Information("Server started at {Prefix}", prefix);

            _cancellationTokenSource = new CancellationTokenSource();
            _ = Task.Run(() => AcceptRequestsAsync(_cancellationTokenSource.Token));
        }

        private static async Task AcceptRequestsAsync(CancellationToken cancellationToken)
        {
            Log.Information("ContentServer now accepting requests");

            while (!cancellationToken.IsCancellationRequested && _httpListener.IsListening)
            {
                try
                {
                    var context = await _httpListener.GetContextAsync();
                    _ = ProcessRequestAsync(context);
                }
                catch (HttpListenerException ex) when (ex.ErrorCode == 995)
                {
                    Log.Information("ContentServer listener stopped");
                    break;
                }
                catch (ObjectDisposedException)
                {
                    Log.Information("ContentServer listener disposed");
                    break;
                }

                catch (Exception ex)
                {
                    Log.Error(ex, "Error accepting request");
                }
            }

            Log.Information("ContentServer stopped accepting requests");
        }

        private static async Task ProcessRequestAsync(HttpListenerContext context)
        {
            var response = context.Response;

            try
            {
                if (!IsTrustedRequest(context.Request))
                {
                    Log.Warning(
                        "Rejected content request from untrusted origin {Origin} and referrer {Referrer}",
                        context.Request.Headers["Origin"] ?? "<missing>",
                        context.Request.UrlReferrer?.GetLeftPart(UriPartial.Authority) ?? "<missing>");
                    response.StatusCode = (int)HttpStatusCode.Forbidden;
                    return;
                }

                if (!string.IsNullOrEmpty(context.Request.Headers["Origin"]))
                {
                    response.AddHeader("Access-Control-Allow-Origin", _trustedOrigin!);
                    response.AddHeader("Vary", "Origin");
                }
                response.AddHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range");

                if (context.Request.HttpMethod == "OPTIONS")
                {
                    response.AddHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                    response.AddHeader("Access-Control-Allow-Headers", "Range");
                    response.StatusCode = (int)HttpStatusCode.NoContent;
                    return;
                }

                var rawUrl = context.Request.RawUrl ?? "";

                if (rawUrl.StartsWith("/api/thumbnail"))
                {
                    await HandleThumbnailRequest(context);
                }
                else if (rawUrl.StartsWith("/api/content"))
                {
                    await HandleContentRequest(context);
                }
                else
                {
                    response.StatusCode = (int)HttpStatusCode.NotFound;
                    response.ContentType = "text/plain";
                    using (var writer = new StreamWriter(response.OutputStream))
                    {
                        await writer.WriteAsync("Invalid endpoint.");
                    }
                }
            }
            catch (HttpListenerException)
            {
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Error processing request for {Url}", context.Request.RawUrl);
                try
                {
                    if (!response.OutputStream.CanWrite)
                        return;

                    response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    response.ContentType = "text/plain";
                    using (var writer = new StreamWriter(response.OutputStream))
                    {
                        await writer.WriteAsync("Internal server error");
                    }
                }
                catch
                {
                }
            }
            finally
            {
                try
                {
                    response.Close();
                }
                catch
                {
                }
            }
        }

        private static async Task HandleThumbnailRequest(HttpListenerContext context)
        {
            var query = HttpUtility.ParseQueryString(context.Request?.Url?.Query ?? "");
            string rawInput = query["input"] ?? "";
            string timeParam = query["time"] ?? "";
            var response = context.Response;

            string? input = ValidateUserPath(rawInput);
            if (input == null || !File.Exists(input))
            {
                Log.Warning("Thumbnail request file not found or invalid: {Input}", rawInput);
                response.StatusCode = (int)HttpStatusCode.NotFound;
                response.ContentType = "text/plain";
                using (var writer = new StreamWriter(response.OutputStream))
                {
                    await writer.WriteAsync("File not found.");
                }
                return;
            }

            if (string.IsNullOrEmpty(timeParam))
            {
                response.ContentType = "image/jpeg";
                response.AddHeader("Cache-Control", "public, max-age=86400");
                response.AddHeader("Expires", DateTime.UtcNow.AddDays(7).ToString("R"));

                try
                {
                    var lastModified = File.GetLastWriteTimeUtc(input);
                    response.AddHeader("Last-Modified", lastModified.ToString("R"));
                }
                catch (Exception ex)
                {
                    Log.Warning(ex, "Could not get last modified time for {Input}", input);
                }

                using (var fs = new FileStream(input, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 81920, useAsync: true))
                {
                    response.ContentLength64 = fs.Length;
                    await fs.CopyToAsync(response.OutputStream);
                }
            }
            else
            {
                if (!double.TryParse(timeParam, System.Globalization.NumberStyles.AllowDecimalPoint, System.Globalization.CultureInfo.InvariantCulture, out double timeSeconds))
                {
                    Log.Warning("Could not parse timeParam={TimeParam}, using 0.0", timeParam);
                    timeSeconds = 0.0;
                }

                if (!FFmpegService.FFmpegExists())
                {
                    Log.Error("FFmpeg executable not found");
                    response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    response.ContentType = "text/plain";
                    using (var writer = new StreamWriter(response.OutputStream))
                    {
                        await writer.WriteAsync("FFmpeg not found on server.");
                    }
                    return;
                }

                byte[] jpegBytes = await FFmpegService.GenerateThumbnail(input, timeSeconds);

                if (jpegBytes != null && jpegBytes.Length > 0)
                {
                    response.ContentType = "image/jpeg";
                    response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                    response.AddHeader("Pragma", "no-cache");
                    response.AddHeader("Expires", "0");
                    response.ContentLength64 = jpegBytes.Length;
                    await response.OutputStream.WriteAsync(jpegBytes, 0, jpegBytes.Length);
                }
                else
                {
                    Log.Error("No thumbnail data received from FFmpeg");
                    response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    response.ContentType = "text/plain";
                    using (var writer = new StreamWriter(response.OutputStream))
                    {
                        await writer.WriteAsync("Failed to generate thumbnail.");
                    }
                }
            }
        }

        private static async Task HandleContentRequest(HttpListenerContext context)
        {
            var query = HttpUtility.ParseQueryString(context.Request?.Url?.Query ?? "");
            string rawInput = query["input"] ?? "";
            var response = context.Response;

            string? fileName = ValidateUserPath(rawInput);
            if (fileName == null || !File.Exists(fileName))
            {
                response.StatusCode = (int)HttpStatusCode.NotFound;
                response.ContentType = "text/plain";
                using (var writer = new StreamWriter(response.OutputStream))
                {
                    await writer.WriteAsync("File not found.");
                }
                return;
            }

            if (fileName.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase))
            {
                await StreamVideoFile(fileName, context);
            }
            else if (fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                await StreamJsonFile(fileName, response);
            }
            else
            {
                response.StatusCode = (int)HttpStatusCode.BadRequest;
                response.ContentType = "text/plain";
                using (var writer = new StreamWriter(response.OutputStream))
                {
                    await writer.WriteAsync("Unsupported file type.");
                }
            }
        }

        private static async Task StreamVideoFile(string fileName, HttpListenerContext context)
        {
            var response = context.Response;

            string rangeHeader = context.Request.Headers["Range"] ?? "";
            long start = 0;
            long end;

            using (var fs = new FileStream(fileName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 262144,
                FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                long fileLength = fs.Length;
                end = fileLength - 1;

                if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes="))
                {
                    string rangeValue = rangeHeader.Substring(6).Trim();
                    // Multiple ranges are not supported by this lightweight server.
                    if (rangeValue.Contains(',') || !TryParseSingleRange(rangeValue, fileLength, out start, out end))
                    {
                        response.StatusCode = (int)HttpStatusCode.RequestedRangeNotSatisfiable;
                        response.AddHeader("Content-Range", $"bytes */{fileLength}");
                        return;
                    }
                }

                if (start > end || start < 0 || end >= fileLength)
                {
                    response.StatusCode = (int)HttpStatusCode.RequestedRangeNotSatisfiable;
                    response.AddHeader("Content-Range", $"bytes */{fileLength}");
                    return;
                }

                long contentLength = end - start + 1;

                response.StatusCode = string.IsNullOrEmpty(rangeHeader) ? (int)HttpStatusCode.OK : (int)HttpStatusCode.PartialContent;
                response.ContentType = "video/mp4";
                response.AddHeader("Accept-Ranges", "bytes");
                // Content-Range is not on the CORS response-header safelist, so the
                // browser hides it from fetch() unless we explicitly expose it.
                // The frontend reads it to determine the full file size from a small
                // probe request (useAudioTracks.ts).
                response.AddHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges");

                if (!string.IsNullOrEmpty(rangeHeader))
                {
                    response.AddHeader("Content-Range", $"bytes {start}-{end}/{fileLength}");
                }

                response.ContentLength64 = contentLength;

                if (start > 0)
                {
                    fs.Seek(start, SeekOrigin.Begin);
                }

                byte[] buffer = new byte[262144];
                long bytesRemaining = contentLength;

                while (bytesRemaining > 0)
                {
                    int bytesToRead = (int)Math.Min(buffer.Length, bytesRemaining);
                    int bytesRead = await fs.ReadAsync(buffer, 0, bytesToRead);

                    if (bytesRead == 0)
                        break;

                    await response.OutputStream.WriteAsync(buffer, 0, bytesRead);
                    bytesRemaining -= bytesRead;
                }
            }
        }

        private static bool TryParseSingleRange(string value, long fileLength, out long start, out long end)
        {
            start = 0;
            end = fileLength - 1;
            if (fileLength <= 0)
                return false;

            string[] parts = value.Split('-', 2);
            if (parts.Length != 2)
                return false;

            if (string.IsNullOrWhiteSpace(parts[0]))
            {
                if (!long.TryParse(parts[1], out long suffixLength) || suffixLength <= 0)
                    return false;

                suffixLength = Math.Min(suffixLength, fileLength);
                start = fileLength - suffixLength;
                return true;
            }

            if (!long.TryParse(parts[0], out start) || start < 0 || start >= fileLength)
                return false;

            if (!string.IsNullOrWhiteSpace(parts[1]))
            {
                if (!long.TryParse(parts[1], out end) || end < start)
                    return false;
                end = Math.Min(end, fileLength - 1);
            }

            return true;
        }

        private static async Task StreamJsonFile(string fileName, HttpListenerResponse response)
        {
            var fileInfo = new FileInfo(fileName);

            response.StatusCode = (int)HttpStatusCode.OK;
            response.ContentType = "application/json";
            response.AddHeader("Accept-Ranges", "bytes");
            response.ContentLength64 = fileInfo.Length;

            using (var fs = new FileStream(fileName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 81920, useAsync: true))
            {
                await fs.CopyToAsync(response.OutputStream);
            }
        }

        private static string? ValidateUserPath(string userPath)
        {
            if (string.IsNullOrWhiteSpace(userPath))
                return null;

            string canonical;
            try
            {
                canonical = Path.GetFullPath(userPath);
            }
            catch
            {
                return null;
            }

            var allowedRoots = new[]
            {
                Settings.Instance.ContentFolder,
                FolderNames.CacheFolder
            };

            foreach (var root in allowedRoots)
            {
                if (string.IsNullOrEmpty(root))
                    continue;

                string rootCanonical;
                try
                {
                    rootCanonical = Path.GetFullPath(root);
                }
                catch
                {
                    continue;
                }

                if (!rootCanonical.EndsWith(Path.DirectorySeparatorChar) &&
                    !rootCanonical.EndsWith(Path.AltDirectorySeparatorChar))
                {
                    rootCanonical += Path.DirectorySeparatorChar;
                }

                if (canonical.StartsWith(rootCanonical, StringComparison.OrdinalIgnoreCase))
                    return canonical;
            }

            return null;
        }

        private static bool IsTrustedRequest(HttpListenerRequest request)
        {
            if (string.IsNullOrEmpty(_trustedOrigin))
                return false;

            string? origin = request.Headers["Origin"];
            if (!string.IsNullOrEmpty(origin))
            {
                return Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
                       string.Equals(uri.GetLeftPart(UriPartial.Authority), _trustedOrigin, StringComparison.OrdinalIgnoreCase);
            }

            // Passive media elements such as img/video may omit Origin for a no-CORS
            // GET, but still send the app origin as the referrer. Require one of the
            // two browser-controlled headers so arbitrary local clients are rejected.
            return request.UrlReferrer is not null &&
                   string.Equals(
                       request.UrlReferrer.GetLeftPart(UriPartial.Authority),
                       _trustedOrigin,
                       StringComparison.OrdinalIgnoreCase);
        }

        public static void StopServer()
        {
            try
            {
                _cancellationTokenSource?.Cancel();
                _httpListener.Stop();
                _httpListener.Close();
                Log.Information("ContentServer stopped");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Error stopping ContentServer");
            }
            finally
            {
                _cancellationTokenSource?.Dispose();
                _cancellationTokenSource = null;
            }
        }
    }
}
