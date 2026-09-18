import { HelpCircle } from 'lucide-react';
import DropdownSelect from '../DropdownSelect';
import {
  Settings as SettingsType,
  VideoQualityPreset,
  DisplayCaptureMethod,
  Codec,
} from '../../Models/types';
import { sendMessageToBackend } from '../../Utils/MessageUtils';
import { useAppState } from '../../Context/AppStateContext';

interface VideoSettingsSectionProps {
  settings: SettingsType;
  updateSettings: (updates: Partial<SettingsType>) => void;
}

const presets: Array<{
  id: VideoQualityPreset;
  label: string;
  description: string;
}> = [
  { id: 'low', label: 'Small file', description: '720p · 30 fps' },
  { id: 'standard', label: 'Standard', description: '1080p · 60 fps' },
  { id: 'high', label: 'High quality', description: 'Up to 1440p · 60 fps' },
  { id: 'custom', label: 'Custom', description: 'Choose recording settings' },
];

const fpsOptions = [10, 20, 30, 60, 90, 120];

function getBufferMaxSizeMb(settings: SettingsType, updates: Partial<SettingsType> = {}) {
  const next = { ...settings, ...updates };
  const bitrateKbps = next.rateControl === 'CBR' ? next.bitrate : next.maxBitrate;
  const estimatedVideoMb = (bitrateKbps * next.replayBufferDuration) / 8000;
  return Math.max(128, Math.ceil(estimatedVideoMb * 1.15 + 32));
}

export default function VideoSettingsSection({
  settings,
  updateSettings,
}: VideoSettingsSectionProps) {
  const appState = useAppState();

  const bitrateKbps = settings.rateControl === 'CBR' ? settings.bitrate : settings.maxBitrate;
  const bufferEstimateMb = getBufferMaxSizeMb(settings);
  const bufferSizeTooltip = `Calculated as bitrate x buffer length / 8, plus 15% overhead and 32 MB safety. Current cap: ${settings.replayBufferMaxSize} MB.`;
  const availableRecordingCodecs = appState.codecs.filter((codec) =>
    settings.encoder === 'gpu' ? codec.isHardwareEncoder : !codec.isHardwareEncoder,
  );
  const codecOptions = availableRecordingCodecs.map((codec) => ({
    value: codec.internalEncoderId,
    label: codec.friendlyName,
  }));
  const selectedCodecValue = settings.codec?.internalEncoderId || codecOptions[0]?.value || '';

  // The backend owns the preset table (PresetsService) and broadcasts the resulting
  // settings, so just ask it to apply one. Mirroring the table here meant maintaining
  // the same numbers in two languages and racing the backend's own broadcast.
  // This matches how the clip presets already work.
  const applyPreset = (preset: VideoQualityPreset) => {
    sendMessageToBackend('ApplyVideoPreset', { preset });
  };

  return (
    <section className="p-4 bg-base-300 rounded-lg shadow-md border border-custom">
      <h2 className="text-xl font-semibold">Recording quality</h2>
      <p className="mt-1 text-sm text-screen-muted">
        Applies to replay buffers and full recordings. Clip exports have separate settings.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 text-left sm:grid-cols-4">
        {presets.map((preset) => {
          const active = settings.videoQualityPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              className={`relative min-h-16 rounded-lg border p-3 pr-6 transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-slate-100 shadow-[0_0_0_1px_rgba(99,247,255,0.14)]'
                  : 'border-screen-line bg-screen-main text-screen-muted hover:border-primary/60 hover:bg-screen-raised'
              }`}
              onClick={() => applyPreset(preset.id)}
            >
              <span className="absolute left-3 top-4 h-4 w-4 rounded-full bg-screen-deep ring-1 ring-screen-line">
                {active && <span className="m-1 block h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="ml-7 block text-sm font-medium">{preset.label}</span>
              <span className="ml-7 mt-1 block text-sm text-screen-muted">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-3 text-left">
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">Encoder</label>
          <DropdownSelect
            ariaLabel="Encoder"
            items={[
              ...(appState.codecs.some((codec) => codec.isHardwareEncoder)
                ? [{ value: 'gpu', label: 'GPU (hardware)' }]
                : []),
              { value: 'cpu', label: 'CPU (software)' },
            ]}
            value={settings.encoder}
            onChange={(val) => {
              const encoder = val as SettingsType['encoder'];
              const nextCodec = appState.codecs.find((codec) =>
                encoder === 'gpu' ? codec.isHardwareEncoder : !codec.isHardwareEncoder,
              );
              updateSettings({
                encoder,
                codec: nextCodec ?? null,
                videoQualityPreset: 'custom',
              });
            }}
          />
        </div>

        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">Video codec</label>
          <DropdownSelect
            ariaLabel="Codec"
            items={
              codecOptions.length > 0 ? codecOptions : [{ value: '', label: 'No codec available' }]
            }
            value={selectedCodecValue}
            onChange={(val) => {
              const codec = appState.codecs.find((item: Codec) => item.internalEncoderId === val);
              if (!codec) return;
              updateSettings({
                codec,
                encoder: codec.isHardwareEncoder ? 'gpu' : 'cpu',
                videoQualityPreset: 'custom',
              });
            }}
            disabled={!appState.hasLoadedObs || codecOptions.length === 0}
          />
        </div>

        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">Resolution</label>
          <DropdownSelect
            ariaLabel="Resolution"
            items={[
              { value: '720p', label: '720p (HD)' },
              { value: '1080p', label: '1080p (Full HD)' },
              ...(appState.maxDisplayHeight >= 1440
                ? [{ value: '1440p', label: '1440p (QHD)' }]
                : []),
              ...(appState.maxDisplayHeight >= 2160 ? [{ value: '4K', label: '4K (UHD)' }] : []),
            ]}
            value={settings.resolution}
            onChange={(val) =>
              updateSettings({
                resolution: val as SettingsType['resolution'],
                videoQualityPreset: 'custom',
              })
            }
          />
        </div>

        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">
            {settings.rateControl === 'CBR' ? 'Video bitrate (kbps)' : 'Maximum bitrate (kbps)'}
          </label>
          <DropdownSelect
            ariaLabel="Bitrate in kilobits per second"
            items={[
              400, 500, 600, 800, 1000, 1500, 2500, 4000, 6000, 9000, 12000, 18000, 24000, 35000,
              50000, 70000,
            ].map((value) => ({
              value: String(value),
              label: String(value),
            }))}
            value={String(bitrateKbps)}
            onChange={(val) => {
              const kbps = Math.max(100, Math.round(Number(val)));
              updateSettings({
                bitrate: kbps,
                minBitrate: Math.max(100, Math.round(kbps * 0.7)),
                maxBitrate: kbps,
                replayBufferMaxSize: getBufferMaxSizeMb(settings, {
                  bitrate: kbps,
                  maxBitrate: kbps,
                }),
                videoQualityPreset: 'custom',
              });
            }}
          />
        </div>

        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">Frame rate (FPS)</label>
          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-screen-line bg-screen-main sm:grid-cols-6">
            {fpsOptions.map((fps) => (
              <button
                key={fps}
                type="button"
                aria-pressed={settings.frameRate === fps}
                aria-label={`${fps} frames per second`}
                className={`h-10 text-lg transition-colors ${
                  settings.frameRate === fps
                    ? 'bg-primary/10 text-primary'
                    : 'text-screen-muted hover:bg-screen-raised'
                }`}
                onClick={() => updateSettings({ frameRate: fps, videoQualityPreset: 'custom' })}
              >
                {fps}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 items-center gap-2 pt-3 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">Replay buffer (seconds)</label>
          <div>
            <div className="flex items-center gap-2">
              <input
                aria-label="Replay buffer length in seconds"
                className="h-10 flex-1 rounded-lg border border-screen-line bg-screen-main px-3 text-slate-200"
                max={600}
                min={5}
                type="number"
                value={settings.replayBufferDuration}
                onChange={(e) => {
                  const replayBufferDuration = Math.min(
                    600,
                    Math.max(5, Math.round(Number(e.target.value) || 30)),
                  );
                  updateSettings({
                    replayBufferDuration,
                    replayBufferMaxSize: getBufferMaxSizeMb(settings, { replayBufferDuration }),
                  });
                }}
              />
              <span title={bufferSizeTooltip}>
                <HelpCircle className="h-4 w-4 text-screen-muted" />
              </span>
            </div>
            <p className="mt-1 text-xs text-screen-muted">
              Estimated buffer memory cap: {bufferEstimateMb} MB
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">Monitor</label>
          <DropdownSelect
            ariaLabel="Monitor"
            items={[
              { value: 'Automatic', label: 'Automatic' },
              ...appState.displays.map((display) => ({
                value: display.deviceId,
                label: `${display.deviceName}${display.isPrimary ? ' (Primary)' : ''}`,
              })),
            ]}
            value={settings.selectedDisplay?.deviceId || 'Automatic'}
            onChange={(val) =>
              updateSettings({
                selectedDisplay:
                  val === 'Automatic'
                    ? undefined
                    : appState.displays.find((display) => display.deviceId === val),
              })
            }
          />
        </div>

        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3">
          <label className="text-sm text-screen-muted">Capture method</label>
          <DropdownSelect
            ariaLabel="Capture method"
            items={[
              { value: 'Auto', label: 'Automatic (recommended)' },
              { value: 'DXGI', label: 'Desktop Duplication (DXGI)' },
              { value: 'WGC', label: 'Windows Graphics Capture (WGC)' },
            ]}
            value={settings.displayCaptureMethod}
            onChange={(val) =>
              updateSettings({ displayCaptureMethod: val as DisplayCaptureMethod })
            }
          />
        </div>
      </div>
      <div className="flex items-center mt-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="alwaysRecord"
            checked={settings.alwaysRecord}
            onChange={(e) => updateSettings({ alwaysRecord: e.target.checked })}
            className="checkbox checkbox-primary checkbox-sm"
          />
          <span className="cursor-pointer">Always record in the background</span>
        </label>
      </div>
      <div className="flex items-center mt-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="discardSessionsWithoutBookmarks"
            checked={settings.discardSessionsWithoutBookmarks}
            onChange={(e) => updateSettings({ discardSessionsWithoutBookmarks: e.target.checked })}
            className="checkbox checkbox-primary checkbox-sm"
          />
          <span className="cursor-pointer">Discard full recordings without manual bookmarks</span>
        </label>
      </div>
    </section>
  );
}
