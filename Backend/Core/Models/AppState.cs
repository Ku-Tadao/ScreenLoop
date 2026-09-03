using ScreenLoop.Backend.App;
using ScreenLoop.Backend.Services;
using ScreenLoop.Backend.Shared;
using ScreenLoop.Backend.Windows.Audio;
using ScreenLoop.Backend.Windows.Display;
using ScreenLoop.Backend.Windows.Watchers;
using Serilog;
using System.Text.Json.Serialization;
using static ScreenLoop.Backend.Utils.GeneralUtils;

namespace ScreenLoop.Backend.Core.Models
{
    internal class AppState : IDisposable
    {
        private static AppState _instance = new AppState();
        public static AppState Instance => _instance;

        private GpuVendor _gpuVendor = GpuVendor.Unknown;
        private double? _cudaComputeCapability = null;
        private PreRecording? _preRecording = null;
        private Recording? _recording = null;
        private bool _hasLoadedObs = false;
        private List<Content> _content = [];

        private List<AudioDevice> _inputDevices = [];
        private List<AudioDevice> _outputDevices = [];
        private List<Display> _displays = [];
        private List<Codec> _codecs = [];
        private List<OBSVersion> _availableOBSVersions = [];
        private bool _isCheckingForUpdates = false;
        private int _maxDisplayHeight = 1080;
        private double _currentFolderSizeGb = 0;
        private double _contentDriveFreeGb = 0;
        private double _contentDriveTotalGb = 0;
        private double _systemAudioLevel = 0;

        private AudioDeviceWatcher? _deviceWatcher;
        private DisplayWatcher? _displayWatcher;
        private System.Threading.Timer? _audioDeviceDebounceTimer;
        private System.Threading.Timer? _displayDebounceTimer;
        private System.Threading.Timer? _systemAudioMeterTimer;
        private DateTime _lastSystemAudioLevelSentUtc = DateTime.MinValue;
        private const int DebounceDelayMs = 3000;
        private const int SystemAudioMeterIntervalMs = 100;
        private const int SystemAudioMeterSendIntervalMs = 150;

        public void Initialize()
        {
            _deviceWatcher = new();
            _deviceWatcher.DevicesChanged += OnAudioDevicesChanged;

            _displayWatcher = new();
            _displayWatcher.DisplaysChanged += OnDisplaysChanged;

            UpdateAudioDevices();
            UpdateDisplays();
            _systemAudioMeterTimer = new System.Threading.Timer(
                _ => SystemAudioLevel = AudioDeviceService.GetDefaultOutputPeak(),
                null,
                0,
                SystemAudioMeterIntervalMs
            );
        }

        private static void SendToFrontend(string cause)
        {
            if (Settings.Instance != null && !Settings.Instance._isBulkUpdating)
            {
                _ = MessageService.SendStateToFrontend(cause);
            }
        }

        [JsonPropertyName("gpuVendor")]
        [JsonConverter(typeof(JsonStringEnumConverter))]
        public GpuVendor GpuVendor
        {
            get => _gpuVendor;
            set
            {
                if (_gpuVendor != value)
                {
                    _gpuVendor = value;
                }
            }
        }

        [JsonPropertyName("cudaComputeCapability")]
        public double? CudaComputeCapability
        {
            get => _cudaComputeCapability;
            set
            {
                if (_cudaComputeCapability != value)
                {
                    _cudaComputeCapability = value;
                }
            }
        }

        [JsonPropertyName("preRecording")]
        public PreRecording? PreRecording
        {
            get => _preRecording;
            set
            {
                if (_preRecording != value)
                {
                    _preRecording = value;
                    SendToFrontend("State update: PreRecording");
                }
            }
        }

        [JsonPropertyName("recording")]
        public Recording? Recording
        {
            get => _recording;
            set
            {
                if (_recording != value)
                {
                    _recording = value;
                    SendToFrontend("State update: Recording");
                }
            }
        }

        [JsonPropertyName("hasLoadedObs")]
        public bool HasLoadedObs
        {
            get => _hasLoadedObs;
            set
            {
                if (_hasLoadedObs != value)
                {
                    _hasLoadedObs = value;
                    SendToFrontend("State update: HasLoadedObs");
                }
            }
        }

        [JsonPropertyName("content")]
        public List<Content> Content
        {
            get => _content;
            private set
            {
                if (_content != value)
                {
                    _content = value;
                    SendToFrontend("State update: Content");
                }
            }
        }

        [JsonPropertyName("inputDevices")]
        public List<AudioDevice> InputDevices
        {
            get => _inputDevices;
            set
            {
                if (_inputDevices != value)
                {
                    _inputDevices = value;
                    SendToFrontend("State update: InputDevices");
                }
            }
        }

        [JsonPropertyName("outputDevices")]
        public List<AudioDevice> OutputDevices
        {
            get => _outputDevices;
            set
            {
                if (_outputDevices != value)
                {
                    _outputDevices = value;
                    SendToFrontend("State update: OutputDevices");
                }
            }
        }

        [JsonPropertyName("displays")]
        public List<Display> Displays
        {
            get => _displays;
            set
            {
                if (_displays != value)
                {
                    _displays = value;
                    SendToFrontend("State update: Displays");
                }
            }
        }

        [JsonPropertyName("maxDisplayHeight")]
        public int MaxDisplayHeight
        {
            get => _maxDisplayHeight;
            set
            {
                if (_maxDisplayHeight != value)
                {
                    _maxDisplayHeight = value;
                    SendToFrontend("State update: MaxDisplayHeight");
                }
            }
        }

        [JsonPropertyName("codecs")]
        public List<Codec> Codecs
        {
            get => _codecs;
            set
            {
                if (_codecs != value)
                {
                    _codecs = value;
                    SendToFrontend("State update: Codecs");
                }
            }
        }

        [JsonPropertyName("availableOBSVersions")]
        public List<OBSVersion> AvailableOBSVersions
        {
            get => _availableOBSVersions;
            set
            {
                if (_availableOBSVersions != value)
                {
                    _availableOBSVersions = value;
                    SendToFrontend("State update: AvailableOBSVersions");
                }
            }
        }

        [JsonPropertyName("isCheckingForUpdates")]
        public bool IsCheckingForUpdates
        {
            get => _isCheckingForUpdates;
            set
            {
                if (_isCheckingForUpdates != value)
                {
                    _isCheckingForUpdates = value;
                    SendToFrontend("State update: IsCheckingForUpdates");
                }
            }
        }

        [JsonPropertyName("currentFolderSizeGb")]
        public double CurrentFolderSizeGb
        {
            get => _currentFolderSizeGb;
            set
            {
                if (Math.Abs(_currentFolderSizeGb - value) > 0.001)
                {
                    _currentFolderSizeGb = value;
                    SendToFrontend("State update: CurrentFolderSizeGb");
                }
            }
        }

        [JsonPropertyName("contentDriveFreeGb")]
        public double ContentDriveFreeGb
        {
            get => _contentDriveFreeGb;
            set
            {
                if (Math.Abs(_contentDriveFreeGb - value) > 0.001)
                {
                    _contentDriveFreeGb = value;
                    SendToFrontend("State update: ContentDriveFreeGb");
                }
            }
        }

        [JsonPropertyName("contentDriveTotalGb")]
        public double ContentDriveTotalGb
        {
            get => _contentDriveTotalGb;
            set
            {
                if (Math.Abs(_contentDriveTotalGb - value) > 0.001)
                {
                    _contentDriveTotalGb = value;
                    SendToFrontend("State update: ContentDriveTotalGb");
                }
            }
        }

        [JsonPropertyName("systemAudioLevel")]
        public double SystemAudioLevel
        {
            get => _systemAudioLevel;
            set
            {
                var clamped = Math.Clamp(value, 0, 1);
                if (Math.Abs(_systemAudioLevel - clamped) <= 0.01)
                    return;

                // Always keep the field current so a full state sync reports the live level;
                // only the outgoing message is throttled.
                _systemAudioLevel = clamped;

                var now = DateTime.UtcNow;
                if (now - _lastSystemAudioLevelSentUtc < TimeSpan.FromMilliseconds(SystemAudioMeterSendIntervalMs))
                    return;

                _lastSystemAudioLevelSentUtc = now;

                // The meter updates several times a second. A full state broadcast would
                // serialize the entire content library each time, so send just the level.
                if (Settings.Instance != null && !Settings.Instance._isBulkUpdating)
                {
                    _ = MessageService.SendSystemAudioLevel(clamped);
                }
            }
        }

        // Cache folder path for metadata, thumbnails, waveforms (read-only, exposed to frontend)
        [JsonPropertyName("cacheFolder")]
        public string CacheFolder => FolderNames.CacheFolder.Replace("\\", "/");

        private void OnAudioDevicesChanged()
        {
            // The meter polls the default endpoint continuously, so drop its cached
            // device immediately rather than waiting out the debounce below.
            AudioDeviceService.InvalidateDefaultOutputCache();

            _audioDeviceDebounceTimer?.Dispose();
            _audioDeviceDebounceTimer = new System.Threading.Timer(
                _ => UpdateAudioDevices(),
                null,
                DebounceDelayMs,
                Timeout.Infinite
            );
        }

        private void OnDisplaysChanged()
        {
            _displayDebounceTimer?.Dispose();
            _displayDebounceTimer = new System.Threading.Timer(
                _ => UpdateDisplays(),
                null,
                DebounceDelayMs,
                Timeout.Infinite
            );
        }

        public void UpdateAudioDevices()
        {
            // Get the list of input devices
            List<AudioDevice> inputDevices = AudioDeviceService.GetInputDevices();
            if (!Enumerable.SequenceEqual(_inputDevices, inputDevices))
            {
                _inputDevices = inputDevices;
            }

            // Get the list of output devices
            List<AudioDevice> outputDevices = AudioDeviceService.GetOutputDevices();
            if (!Enumerable.SequenceEqual(_outputDevices, outputDevices))
            {
                _outputDevices = outputDevices;
            }

            Log.Information("Audio devices");
            Log.Information("-------------");
            foreach (AudioDevice device in InputDevices)
            {
                Log.Information($"Input device: {device.Name} {device.Id}");
            }

            foreach (AudioDevice device in OutputDevices)
            {
                Log.Information($"Output device: {device.Name} {device.Id}");
            }
            Log.Information("-------------");

            // Reconcile selected device settings with available devices
            // This handles cases where device IDs change (e.g., after Windows/driver updates)
            SettingsService.ReconcileDeviceSettings(Settings.Instance.InputDevices, inputDevices, "input");
            SettingsService.ReconcileDeviceSettings(Settings.Instance.OutputDevices, outputDevices, "output");

            _ = MessageService.SendStateToFrontend("Updated audio devices");
            _ = MessageService.SendSettingsToFrontend("Updated audio devices (device reconciliation may have changed selections)");
        }

        private static void UpdateDisplays()
        {
            bool hasChanged = DisplayService.LoadAvailableMonitorsIntoState();
            if (hasChanged)
            {
                SendToFrontend("Display change detected");
            }
        }

        public void UpdateRecordingEndTime(DateTime endTime)
        {
            if (_recording != null)
            {
                _recording.EndTime = endTime;
                SendToFrontend("State update: Recording end time");
            }
        }

        public void SetContent(List<Content> contents, bool sendToFrontend)
        {
            _content = contents;
            if (sendToFrontend)
            {
                SendToFrontend("State update: Content");
            }
        }

        public void Dispose()
        {
            if (_deviceWatcher != null)
            {
                _deviceWatcher.DevicesChanged -= OnAudioDevicesChanged;
                _deviceWatcher.Dispose();
                _deviceWatcher = null;
            }

            if (_displayWatcher != null)
            {
                _displayWatcher.DisplaysChanged -= OnDisplaysChanged;
                _displayWatcher.Dispose();
                _displayWatcher = null;
            }

            _audioDeviceDebounceTimer?.Dispose();
            _displayDebounceTimer?.Dispose();
            _systemAudioMeterTimer?.Dispose();
        }
    }
}
