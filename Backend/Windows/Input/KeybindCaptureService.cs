using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using ScreenLoop.Backend.App;
using ScreenLoop.Backend.Core.Models;
using ScreenLoop.Backend.Recorder;
using ScreenLoop.Backend.Services;
using Serilog;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace ScreenLoop.Backend.Windows.Input
{
    internal class KeybindCaptureService
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_HOTKEY = 0x0312;
        private const int WM_INPUT = 0x00FF;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int VK_CONTROL = 0x11;
        private const int VK_ALT = 0x12;
        private const int VK_SHIFT = 0x10;
        private const int VK_LSHIFT = 0xA0;
        private const int VK_RSHIFT = 0xA1;
        private const int VK_LCONTROL = 0xA2;
        private const int VK_RCONTROL = 0xA3;
        private const int VK_LALT = 0xA4;
        private const int VK_RALT = 0xA5;
        private const int VK_NUMPAD0 = 0x60;
        private const int VK_NUMPAD1 = 0x61;
        private const int VK_NUMPAD2 = 0x62;
        private const int VK_NUMPAD3 = 0x63;
        private const int VK_NUMPAD4 = 0x64;
        private const int VK_NUMPAD5 = 0x65;
        private const int VK_NUMPAD6 = 0x66;
        private const int VK_NUMPAD7 = 0x67;
        private const int VK_NUMPAD8 = 0x68;
        private const int VK_NUMPAD9 = 0x69;
        private const int VK_INSERT = 0x2D;
        private const int VK_DELETE = 0x2E;
        private const int VK_END = 0x23;
        private const int VK_DOWN = 0x28;
        private const int VK_NEXT = 0x22;
        private const int VK_LEFT = 0x25;
        private const int VK_CLEAR = 0x0C;
        private const int VK_RIGHT = 0x27;
        private const int VK_HOME = 0x24;
        private const int VK_UP = 0x26;
        private const int VK_PRIOR = 0x21;
        private const int KEY_PRESSED_MASK = 0x8000;
        private const uint MOD_ALT = 0x0001;
        private const uint MOD_CONTROL = 0x0002;
        private const uint MOD_SHIFT = 0x0004;
        private const uint MOD_NOREPEAT = 0x4000;
        private const uint RIDEV_INPUTSINK = 0x00000100;
        private const uint RID_INPUT = 0x10000003;
        private const int RIM_TYPEKEYBOARD = 1;
        private const ushort RI_KEY_BREAK = 0x0001;

        private static LowLevelKeyboardProc _proc = HookCallback;
        private static IntPtr _hookID = IntPtr.Zero;
        private static HotkeyMessageWindow? _messageWindow;
        private static List<Keybind>? _cachedKeybindings;
        private static HashSet<int>? _boundMainKeys;
        private static readonly Dictionary<int, KeybindAction> _registeredHotkeys = new Dictionary<int, KeybindAction>();
        private static readonly HashSet<int> _rawPressedKeys = new HashSet<int>();
        private static readonly object HotkeyLock = new object();
        private static readonly int[] _pressedKeys = new int[4];
        private static KeybindAction? _lastAction;
        private static DateTime _lastActionAtUtc = DateTime.MinValue;
        private static int _nextHotkeyId = 0x534C; // "SL"

        public static void Start()
        {
            RefreshKeybindingsCache();
            _hookID = SetHook(_proc);
            _messageWindow = new HotkeyMessageWindow();
            RegisterHotkeys();
            RegisterRawInput(_messageWindow.Handle);
            Application.Run();
        }

        public static void Stop()
        {
            UnregisterHotkeys();
            UnhookWindowsHookEx(_hookID);
        }

        public static void RefreshKeybindingsCache()
        {
            var keybindings = Settings.Instance.Keybindings?.Where(k => k.Enabled).ToList();
            _cachedKeybindings = keybindings;

            if (keybindings != null && keybindings.Count > 0)
            {
                _boundMainKeys = new HashSet<int>();
                foreach (var kb in keybindings)
                {
                    foreach (var key in kb.Keys)
                    {
                        if (key != VK_CONTROL && key != VK_ALT && key != VK_SHIFT)
                        {
                            _boundMainKeys.Add(key);
                            foreach (var alias in GetKeyAliases(key))
                            {
                                _boundMainKeys.Add(alias);
                            }
                        }
                    }
                }
            }
            else
            {
                _boundMainKeys = null;
            }

            RegisterHotkeys();
        }

        private static IntPtr SetHook(LowLevelKeyboardProc proc)
        {
            ProcessModule curModule = Process.GetCurrentProcess().MainModule!;
            return SetWindowsHookEx(
                WH_KEYBOARD_LL,
                proc,
                GetModuleHandle(curModule.ModuleName),
                0
            );
        }

        private delegate IntPtr LowLevelKeyboardProc(
            int nCode, IntPtr wParam, IntPtr lParam);

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN))
            {
                var boundKeys = _boundMainKeys;
                if (boundKeys == null || boundKeys.Count == 0)
                {
                    return CallNextHookEx(_hookID, nCode, wParam, lParam);
                }

                int vkCode = Marshal.ReadInt32(lParam);

                if (!boundKeys.Contains(vkCode))
                {
                    return CallNextHookEx(_hookID, nCode, wParam, lParam);
                }

                bool ctrlPressed = (GetKeyState(VK_CONTROL) & KEY_PRESSED_MASK) != 0;
                bool altPressed = (GetKeyState(VK_ALT) & KEY_PRESSED_MASK) != 0;
                bool shiftPressed = (GetKeyState(VK_SHIFT) & KEY_PRESSED_MASK) != 0;

                int pressedCount = 0;
                if (ctrlPressed) _pressedKeys[pressedCount++] = VK_CONTROL;
                if (altPressed) _pressedKeys[pressedCount++] = VK_ALT;
                if (shiftPressed) _pressedKeys[pressedCount++] = VK_SHIFT;
                _pressedKeys[pressedCount++] = vkCode;

                var keybindings = _cachedKeybindings!;
                foreach (var keybind in keybindings)
                {
                    if (DoKeysMatch(keybind.Keys, pressedCount))
                    {
                        TriggerKeybindAction(keybind.Action, "low-level hook");
                    }
                }
            }

            return CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        private static bool DoKeysMatch(List<int> keybindKeys, int pressedCount)
        {
            bool keybindHasModifier = keybindKeys.Any(IsModifierKey);
            if (!keybindHasModifier && keybindKeys.Count != pressedCount)
                return false;

            if (keybindHasModifier && keybindKeys.Count > pressedCount)
                return false;

            foreach (var key in keybindKeys)
            {
                bool found = false;
                for (int i = 0; i < pressedCount; i++)
                {
                    if (KeysEquivalent(_pressedKeys[i], key))
                    {
                        found = true;
                        break;
                    }
                }
                if (!found) return false;
            }

            return true;
        }

        private static bool IsModifierKey(int key)
        {
            return key == VK_CONTROL || key == VK_ALT || key == VK_SHIFT;
        }

        private static void RegisterHotkeys()
        {
            var window = _messageWindow;
            if (window == null || window.Handle == IntPtr.Zero)
                return;

            lock (HotkeyLock)
            {
                UnregisterHotkeys();
                var keybindings = _cachedKeybindings;
                if (keybindings == null)
                    return;

                foreach (var keybind in keybindings)
                {
                    if (!TryGetHotkeyParts(keybind.Keys, out uint modifiers, out uint key))
                    {
                        Log.Warning("Skipping hotkey registration for {Action}: no primary key found", keybind.Action);
                        continue;
                    }

                    foreach (uint hotkey in GetRegisteredHotkeyAliases((int)key))
                    {
                        int id = _nextHotkeyId++;
                        if (RegisterHotKey(window.Handle, id, modifiers | MOD_NOREPEAT, hotkey))
                        {
                            _registeredHotkeys[id] = keybind.Action;
                            Log.Information("Registered Windows hotkey {Id} for {Action}", id, keybind.Action);
                        }
                        else
                        {
                            int error = Marshal.GetLastWin32Error();
                            Log.Warning("Failed to register Windows hotkey for {Action}. Win32 error: {Error}", keybind.Action, error);
                        }
                    }
                }
            }
        }

        private static void UnregisterHotkeys()
        {
            var window = _messageWindow;
            if (window == null || window.Handle == IntPtr.Zero)
                return;

            foreach (int id in _registeredHotkeys.Keys.ToList())
            {
                UnregisterHotKey(window.Handle, id);
            }
            _registeredHotkeys.Clear();
        }

        private static bool TryGetHotkeyParts(List<int> keys, out uint modifiers, out uint key)
        {
            modifiers = 0;
            key = 0;

            foreach (int value in keys)
            {
                switch (value)
                {
                    case VK_CONTROL:
                        modifiers |= MOD_CONTROL;
                        break;
                    case VK_ALT:
                        modifiers |= MOD_ALT;
                        break;
                    case VK_SHIFT:
                        modifiers |= MOD_SHIFT;
                        break;
                    default:
                        key = (uint)value;
                        break;
                }
            }

            return key != 0;
        }

        private static void RegisterRawInput(IntPtr hwnd)
        {
            RAWINPUTDEVICE[] rid =
            [
                new RAWINPUTDEVICE
                {
                    usUsagePage = 0x01,
                    usUsage = 0x06,
                    dwFlags = RIDEV_INPUTSINK,
                    hwndTarget = hwnd
                }
            ];

            if (!RegisterRawInputDevices(rid, (uint)rid.Length, (uint)Marshal.SizeOf<RAWINPUTDEVICE>()))
            {
                Log.Warning("Failed to register Raw Input keyboard sink. Win32 error: {Error}", Marshal.GetLastWin32Error());
            }
            else
            {
                Log.Information("Registered Raw Input keyboard sink for hotkey fallback");
            }
        }

        private static void HandleRawInput(IntPtr lParam)
        {
            uint dwSize = 0;
            GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref dwSize, (uint)Marshal.SizeOf<RAWINPUTHEADER>());
            if (dwSize == 0)
                return;

            IntPtr buffer = Marshal.AllocHGlobal((int)dwSize);
            try
            {
                uint read = GetRawInputData(lParam, RID_INPUT, buffer, ref dwSize, (uint)Marshal.SizeOf<RAWINPUTHEADER>());
                if (read != dwSize)
                    return;

                RAWINPUT raw = Marshal.PtrToStructure<RAWINPUT>(buffer);
                if (raw.header.dwType != RIM_TYPEKEYBOARD)
                    return;

                int vk = NormalizeVirtualKey(raw.keyboard.VKey);
                if (vk == 0 || vk == 255)
                    return;

                bool isKeyUp = (raw.keyboard.Flags & RI_KEY_BREAK) == RI_KEY_BREAK;
                if (isKeyUp)
                {
                    _rawPressedKeys.Remove(vk);
                    return;
                }

                _rawPressedKeys.Add(vk);

                var boundKeys = _boundMainKeys;
                if (boundKeys == null || !boundKeys.Contains(vk))
                    return;

                var keybindings = _cachedKeybindings;
                if (keybindings == null)
                    return;

                int pressedCount = 0;
                if (_rawPressedKeys.Contains(VK_CONTROL)) _pressedKeys[pressedCount++] = VK_CONTROL;
                if (_rawPressedKeys.Contains(VK_ALT)) _pressedKeys[pressedCount++] = VK_ALT;
                if (_rawPressedKeys.Contains(VK_SHIFT)) _pressedKeys[pressedCount++] = VK_SHIFT;
                _pressedKeys[pressedCount++] = vk;

                foreach (var keybind in keybindings)
                {
                    if (DoKeysMatch(keybind.Keys, pressedCount))
                    {
                        TriggerKeybindAction(keybind.Action, "raw input");
                    }
                }
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }

        private static int NormalizeVirtualKey(int vk)
        {
            return vk switch
            {
                VK_LCONTROL or VK_RCONTROL => VK_CONTROL,
                VK_LALT or VK_RALT => VK_ALT,
                VK_LSHIFT or VK_RSHIFT => VK_SHIFT,
                _ => vk
            };
        }

        private static IEnumerable<uint> GetRegisteredHotkeyAliases(int vk)
        {
            yield return (uint)vk;

            int? navigationAlias = vk switch
            {
                VK_NUMPAD0 => VK_INSERT,
                VK_NUMPAD1 => VK_END,
                VK_NUMPAD2 => VK_DOWN,
                VK_NUMPAD3 => VK_NEXT,
                VK_NUMPAD4 => VK_LEFT,
                VK_NUMPAD5 => VK_CLEAR,
                VK_NUMPAD6 => VK_RIGHT,
                VK_NUMPAD7 => VK_HOME,
                VK_NUMPAD8 => VK_UP,
                VK_NUMPAD9 => VK_PRIOR,
                _ => null
            };

            if (navigationAlias.HasValue)
            {
                yield return (uint)navigationAlias.Value;
            }
        }

        private static IEnumerable<int> GetKeyAliases(int vk)
        {
            int? alias = vk switch
            {
                VK_NUMPAD0 => VK_INSERT,
                VK_NUMPAD1 => VK_END,
                VK_NUMPAD2 => VK_DOWN,
                VK_NUMPAD3 => VK_NEXT,
                VK_NUMPAD4 => VK_LEFT,
                VK_NUMPAD5 => VK_CLEAR,
                VK_NUMPAD6 => VK_RIGHT,
                VK_NUMPAD7 => VK_HOME,
                VK_NUMPAD8 => VK_UP,
                VK_NUMPAD9 => VK_PRIOR,
                VK_INSERT => VK_NUMPAD0,
                VK_END => VK_NUMPAD1,
                VK_DOWN => VK_NUMPAD2,
                VK_NEXT => VK_NUMPAD3,
                VK_LEFT => VK_NUMPAD4,
                VK_CLEAR => VK_NUMPAD5,
                VK_RIGHT => VK_NUMPAD6,
                VK_HOME => VK_NUMPAD7,
                VK_UP => VK_NUMPAD8,
                VK_PRIOR => VK_NUMPAD9,
                _ => null
            };

            if (alias.HasValue)
            {
                yield return alias.Value;
            }
        }

        private static bool KeysEquivalent(int pressedKey, int boundKey)
        {
            return pressedKey == boundKey || GetKeyAliases(boundKey).Contains(pressedKey);
        }

        private static void TriggerKeybindAction(KeybindAction action, string source)
        {
            lock (HotkeyLock)
            {
                DateTime now = DateTime.UtcNow;
                if (_lastAction == action && (now - _lastActionAtUtc).TotalMilliseconds < 350)
                {
                    return;
                }

                _lastAction = action;
                _lastActionAtUtc = now;
            }

            Log.Information("Hotkey action {Action} triggered by {Source}", action, source);
            HandleKeybindAction(action);
        }

        private static void HandleKeybindAction(KeybindAction action)
        {
            var recording = AppState.Instance.Recording;
            var preRecording = AppState.Instance.PreRecording;
            var recordingMode = Settings.Instance.RecordingMode;

            switch (action)
            {
                case KeybindAction.CreateBookmark:
                    if (recording != null && (recordingMode == RecordingMode.Session || recordingMode == RecordingMode.Hybrid))
                    {
                        Log.Information("Saving bookmark...");
                        recording.Bookmarks.Add(new Bookmark
                        {
                            Type = BookmarkType.Manual,
                            Time = DateTime.Now - recording.StartTime
                        });
                        Task.Run(PlayBookmarkSound);
                        _ = MessageService.SendFrontendMessage("BookmarkCreated", new { });
                    }
                    break;

                case KeybindAction.SaveReplayBuffer:
                    if (recording != null && (recordingMode == RecordingMode.Buffer || recordingMode == RecordingMode.Hybrid))
                    {
                        Log.Information("Saving replay buffer...");
                        Task.Run(OBSService.SaveReplayBuffer);
                        Task.Run(PlayBookmarkSound);
                    }
                    break;

                case KeybindAction.ToggleRecording:
                    if (recording != null || preRecording != null)
                    {
                        Log.Information("Hotkey: stopping recording");
                        Task.Run(OBSService.StopRecording);
                    }
                    else
                    {
                        Log.Information("Hotkey: starting display recording");
                        Task.Run(() => OBSService.StartRecording());
                    }
                    break;

                case KeybindAction.TogglePreview:
                    if (recording != null)
                    {
                        Log.Information("Hotkey: toggling recording preview");
                        RecordingPreviewService.Toggle();
                    }
                    break;
            }
        }

        private static void PlayBookmarkSound()
        {
            using var audioStream = new MemoryStream(Properties.Resources.bookmark);
            using var audioReader = new WaveFileReader(audioStream);
            var sampleProvider = audioReader.ToSampleProvider();
            var volumeProvider = new VolumeSampleProvider(sampleProvider)
            {
                Volume = Settings.Instance.SoundEffectsVolume
            };

            using var waveOut = new WasapiOut(AudioClientShareMode.Shared, 100);
            waveOut.Init(volumeProvider);
            waveOut.Play();

            while (waveOut.PlaybackState == PlaybackState.Playing)
                Thread.Sleep(10);
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook,
            LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk,
            int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        private static extern short GetKeyState(int nVirtKey);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterRawInputDevices([In] RAWINPUTDEVICE[] pRawInputDevices, uint uiNumDevices, uint cbSize);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetRawInputData(IntPtr hRawInput, uint uiCommand, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);

        private class HotkeyMessageWindow : NativeWindow
        {
            public HotkeyMessageWindow()
            {
                CreateHandle(new CreateParams());
            }

            protected override void WndProc(ref Message m)
            {
                if (m.Msg == WM_HOTKEY)
                {
                    int id = m.WParam.ToInt32();
                    KeybindAction? action = null;
                    lock (HotkeyLock)
                    {
                        if (_registeredHotkeys.TryGetValue(id, out var registeredAction))
                        {
                            action = registeredAction;
                        }
                    }

                    if (action.HasValue)
                    {
                        TriggerKeybindAction(action.Value, "registered hotkey");
                    }
                    return;
                }

                if (m.Msg == WM_INPUT)
                {
                    HandleRawInput(m.LParam);
                }

                base.WndProc(ref m);
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RAWINPUTDEVICE
        {
            public ushort usUsagePage;
            public ushort usUsage;
            public uint dwFlags;
            public IntPtr hwndTarget;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RAWINPUTHEADER
        {
            public int dwType;
            public int dwSize;
            public IntPtr hDevice;
            public IntPtr wParam;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RAWKEYBOARD
        {
            public ushort MakeCode;
            public ushort Flags;
            public ushort Reserved;
            public ushort VKey;
            public uint Message;
            public uint ExtraInformation;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RAWINPUT
        {
            public RAWINPUTHEADER header;
            public RAWKEYBOARD keyboard;
        }
    }
}
