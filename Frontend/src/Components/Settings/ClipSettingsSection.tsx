import { motion, AnimatePresence } from 'framer-motion';
import DropdownSelect from '../DropdownSelect';
import {
  Settings as SettingsType,
  GpuVendor,
  ClipFPS,
  ClipPreset,
  ClipQualityPreset,
  ClipResolution,
  ClipAudioCodec,
  ClipAudioQuality,
} from '../../Models/types';
import { sendMessageToBackend } from '../../Utils/MessageUtils';
import { useAppState } from '../../Context/AppStateContext';

interface ClipSettingsSectionProps {
  settings: SettingsType;
  updateSettings: (updates: Partial<SettingsType>) => void;
}

export default function ClipSettingsSection({
  settings,
  updateSettings,
}: ClipSettingsSectionProps) {
  const appState = useAppState();
  const hasHardwareAv1 = appState.codecs.some((codec) => {
    if (!codec.isHardwareEncoder || !codec.internalEncoderId.toLowerCase().includes('av1'))
      return false;
    const id = codec.internalEncoderId.toLowerCase();
    return appState.gpuVendor === GpuVendor.Nvidia
      ? id.includes('nvenc')
      : appState.gpuVendor === GpuVendor.AMD
        ? id.includes('amf')
        : appState.gpuVendor === GpuVendor.Intel && id.includes('qsv');
  });
  const cpuQualityItems = Array.from(
    { length: settings.clipCodec === 'av1' ? 64 : 52 },
    (_, value) => {
      const label =
        value === 0
          ? '0 (Highest quality setting)'
          : value === (settings.clipCodec === 'av1' ? 63 : 51)
            ? `${value} (Lowest quality setting)`
            : String(value);

      return { value: String(value), label };
    },
  );

  // Helper function to get available presets based on encoder settings
  const getAvailablePresets = (
    encoder: string,
    codec: string,
    gpuVendor: GpuVendor,
  ): Array<{ value: string; label: string }> => {
    if (encoder === 'cpu') {
      if (codec === 'av1') {
        return [
          { value: 'svt-4', label: 'Preset 4 (Efficient)' },
          { value: 'svt-5', label: 'Preset 5' },
          { value: 'svt-6', label: 'Preset 6 (Balanced)' },
          { value: 'svt-7', label: 'Preset 7' },
          { value: 'svt-8', label: 'Preset 8 (Fast)' },
          { value: 'svt-9', label: 'Preset 9' },
          { value: 'svt-10', label: 'Preset 10 (Very fast)' },
          { value: 'svt-11', label: 'Preset 11' },
          { value: 'svt-12', label: 'Preset 12' },
          { value: 'svt-13', label: 'Preset 13 (Fastest)' },
        ];
      }
      return [
        { value: 'ultrafast', label: 'Ultrafast' },
        { value: 'superfast', label: 'Superfast' },
        { value: 'veryfast', label: 'Veryfast' },
        { value: 'faster', label: 'Faster' },
        { value: 'fast', label: 'Fast' },
        { value: 'medium', label: 'Medium' },
        { value: 'slow', label: 'Slow' },
        { value: 'slower', label: 'Slower' },
        { value: 'veryslow', label: 'Veryslow' },
      ];
    }

    switch (gpuVendor) {
      case GpuVendor.Nvidia:
        // AV1 NVENC uses different presets (p1-p7)
        if (codec === 'av1') {
          return [
            { value: 'p1', label: 'P1 (Fastest)' },
            { value: 'p2', label: 'P2' },
            { value: 'p3', label: 'P3' },
            { value: 'p4', label: 'P4 (Balanced)' },
            { value: 'p5', label: 'P5' },
            { value: 'p6', label: 'P6' },
            { value: 'p7', label: 'P7 (Slowest/Best Quality)' },
          ];
        }
        return [
          { value: 'slow', label: 'Slow' },
          { value: 'medium', label: 'Medium' },
          { value: 'fast', label: 'Fast' },
          { value: 'hp', label: 'High Performance' },
          { value: 'hq', label: 'High Quality' },
          { value: 'bd', label: 'Blu-ray Disk' },
          { value: 'll', label: 'Low Latency' },
          { value: 'llhq', label: 'Low Latency High Quality' },
          { value: 'llhp', label: 'Low Latency High Performance' },
          { value: 'lossless', label: 'Lossless' },
          { value: 'losslesshp', label: 'Lossless High Performance' },
        ];
      case GpuVendor.AMD:
        return [
          { value: 'quality', label: 'Quality' },
          { value: 'transcoding', label: 'Transcoding (Balanced)' },
          { value: 'lowlatency', label: 'Low Latency (Fast)' },
          { value: 'ultralowlatency', label: 'Ultra Low Latency (Fastest)' },
        ];
      case GpuVendor.Intel:
        return [
          { value: 'fast', label: 'Fast' },
          { value: 'medium', label: 'Medium' },
          { value: 'slow', label: 'Slow' },
        ];
      default:
        return [];
    }
  };

  const handlePresetChange = (preset: ClipQualityPreset) => {
    sendMessageToBackend('ApplyClipPreset', { preset });
  };

  const clipBitrateItems = [
    { value: '0', label: 'Quality-based (variable file size)' },
    { value: '400', label: '400 kbps' },
    { value: '600', label: '600 kbps' },
    { value: '800', label: '800 kbps' },
    { value: '1000', label: '1 Mbps' },
    { value: '1500', label: '1.5 Mbps' },
    { value: '2500', label: '2.5 Mbps' },
    { value: '4000', label: '4 Mbps' },
    { value: '6000', label: '6 Mbps' },
    { value: '8000', label: '8 Mbps' },
    { value: '12000', label: '12 Mbps' },
    { value: '16000', label: '16 Mbps' },
    { value: '24000', label: '24 Mbps' },
    { value: '35000', label: '35 Mbps' },
    { value: '50000', label: '50 Mbps' },
  ];

  return (
    <div className="p-4 bg-base-300 rounded-lg shadow-md border border-custom">
      <h2 className="text-xl font-semibold mb-1">Clip export</h2>
      <p className="mb-4 text-sm text-base-content/70">
        Choose an export profile, or select Custom to adjust encoding. The three profiles use CPU
        encoding. Compression also uses these codec, bitrate, and resolution settings.
      </p>

      {/* Quality Preset Selector */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <button
            type="button"
            aria-pressed={settings.clipQualityPreset === 'low'}
            className={`bg-base-200 p-3 rounded-lg flex flex-col items-center justify-center transition-all transition-200 border cursor-pointer hover:bg-base-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-300 ${
              settings.clipQualityPreset === 'low' ? 'border-primary' : 'border-base-400'
            }`}
            onClick={() => handlePresetChange('low')}
          >
            <div className="text-sm font-semibold">Small file</div>
            <div className="text-xs text-base-content text-opacity-70 mt-1">
              {settings.clipCodec === 'av1' ? 'AV1 · 400 kbps' : 'H.264 · 4 Mbps'} · 720p · 30 fps
            </div>
          </button>
          <button
            type="button"
            aria-pressed={settings.clipQualityPreset === 'standard'}
            className={`bg-base-200 p-3 rounded-lg flex flex-col items-center justify-center transition-all transition-200 border cursor-pointer hover:bg-base-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-300 ${
              settings.clipQualityPreset === 'standard' ? 'border-primary' : 'border-base-400'
            }`}
            onClick={() => handlePresetChange('standard')}
          >
            <div className="text-sm font-semibold">Standard</div>
            <div className="text-xs text-base-content text-opacity-70 mt-1">
              {settings.clipCodec === 'av1' ? 'AV1 · 800 kbps' : 'H.264 · 8 Mbps'} · Source size ·
              60 fps
            </div>
          </button>
          <button
            type="button"
            aria-pressed={settings.clipQualityPreset === 'high'}
            className={`bg-base-200 p-3 rounded-lg flex flex-col items-center justify-center transition-all transition-200 border cursor-pointer hover:bg-base-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-300 ${
              settings.clipQualityPreset === 'high' ? 'border-primary' : 'border-base-400'
            }`}
            onClick={() => handlePresetChange('high')}
          >
            <div className="text-sm font-semibold">High quality</div>
            <div className="text-xs text-base-content text-opacity-70 mt-1">
              {settings.clipCodec === 'av1' ? 'AV1 · 1.5 Mbps' : 'H.264 · 16 Mbps'} · Source size ·
              60 fps
            </div>
          </button>
          <button
            type="button"
            aria-pressed={settings.clipQualityPreset === 'custom'}
            className={`bg-base-200 p-3 rounded-lg flex flex-col items-center justify-center transition-all transition-200 border cursor-pointer hover:bg-base-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-300 ${
              settings.clipQualityPreset === 'custom' ? 'border-primary' : 'border-base-400'
            }`}
            onClick={() => handlePresetChange('custom')}
          >
            <div className="text-sm font-semibold">Custom</div>
            <div className="text-xs text-base-content text-opacity-70 mt-1">
              Choose encoding settings
            </div>
          </button>
        </div>
      </div>

      {/* Advanced Settings - Only show when Custom preset is selected */}
      <AnimatePresence>
        {settings.clipQualityPreset === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: 1,
              height: 'fit-content',
              transition: {
                duration: 0.3,
                height: { type: 'spring', stiffness: 300, damping: 30 },
              },
            }}
            exit={{
              opacity: 0,
              height: 0,
              transition: {
                duration: 0.2,
              },
            }}
            style={{ overflow: 'visible' }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Encoder */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Encoder</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip encoder"
                  items={[
                    { value: 'cpu', label: 'CPU (software)' },
                    ...(appState.gpuVendor !== GpuVendor.Unknown
                      ? [{ value: 'gpu', label: `GPU (${appState.gpuVendor})` }]
                      : []),
                  ]}
                  value={settings.clipEncoder}
                  onChange={(val) => {
                    const newSettings: Partial<SettingsType> = {
                      clipEncoder: val as 'cpu' | 'gpu',
                    };
                    const codec =
                      val === 'gpu' && settings.clipCodec === 'av1' && !hasHardwareAv1
                        ? 'h264'
                        : settings.clipCodec;
                    newSettings.clipCodec = codec;
                    if (val === 'cpu' && settings.clipEncoder !== 'cpu') {
                      newSettings.clipPreset = codec === 'av1' ? 'svt-6' : 'veryfast';
                    } else if (val === 'gpu' && settings.clipEncoder !== 'gpu') {
                      // Set default preset based on GPU vendor
                      switch (appState.gpuVendor) {
                        case GpuVendor.AMD:
                          newSettings.clipPreset = 'transcoding' as ClipPreset;
                          break;
                        case GpuVendor.Intel:
                          newSettings.clipPreset = 'medium' as ClipPreset;
                          break;
                        case GpuVendor.Nvidia:
                        default:
                          newSettings.clipPreset = codec === 'av1' ? 'p4' : 'medium';
                          break;
                      }
                    }
                    newSettings.clipQualityCpu = Math.min(
                      settings.clipQualityCpu,
                      codec === 'av1' ? 63 : 51,
                    );
                    updateSettings(newSettings);
                  }}
                />
              </div>

              {/* Quality Control - Different for CPU vs GPU */}
              {settings.clipEncoder === 'cpu' ? (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-base-content">Quality (CRF)</span>
                  </label>
                  <DropdownSelect
                    ariaLabel="Clip CPU quality"
                    disabled={settings.clipVideoBitrate > 0}
                    items={cpuQualityItems}
                    value={String(settings.clipQualityCpu)}
                    onChange={(val) => updateSettings({ clipQualityCpu: Number(val) })}
                  />
                  <p className="mt-2 text-xs text-base-content/70">
                    {settings.clipVideoBitrate > 0
                      ? 'Quality is controlled by the target video bitrate. Select Quality-based in Video bitrate to use CRF.'
                      : 'Lower values preserve more detail and usually produce larger files. The scale depends on the codec.'}
                  </p>
                </div>
              ) : (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-base-content">
                      Quality (
                      {appState.gpuVendor === GpuVendor.Nvidia
                        ? 'CQ'
                        : appState.gpuVendor === GpuVendor.AMD
                          ? 'QP'
                          : appState.gpuVendor === GpuVendor.Intel
                            ? 'ICQ'
                            : 'CQ'}
                      )
                    </span>
                  </label>
                  <DropdownSelect
                    ariaLabel="Clip GPU quality"
                    disabled={settings.clipVideoBitrate > 0}
                    items={
                      appState.gpuVendor === GpuVendor.Nvidia
                        ? [
                            { value: '0', label: '0 (Automatic)' },
                            { value: '10', label: '10' },
                            { value: '15', label: '15' },
                            { value: '20', label: '20 (High Quality)' },
                            { value: '23', label: '23 (Normal Quality)' },
                            { value: '26', label: '26' },
                            { value: '30', label: '30 (Low Quality)' },
                            { value: '35', label: '35' },
                            { value: '40', label: '40' },
                            { value: '45', label: '45' },
                            { value: '51', label: '51 (Lowest Quality)' },
                          ]
                        : appState.gpuVendor === GpuVendor.AMD
                          ? [
                              { value: '0', label: '0 (Highest Quality)' },
                              { value: '10', label: '10' },
                              { value: '15', label: '15' },
                              { value: '20', label: '20 (High Quality)' },
                              { value: '23', label: '23 (Normal Quality)' },
                              { value: '26', label: '26' },
                              { value: '30', label: '30 (Low Quality)' },
                              { value: '35', label: '35' },
                              { value: '40', label: '40' },
                              { value: '45', label: '45' },
                              { value: '51', label: '51 (Lowest Quality)' },
                            ]
                          : appState.gpuVendor === GpuVendor.Intel
                            ? [
                                { value: '1', label: '1 (Highest Quality)' },
                                { value: '10', label: '10' },
                                { value: '15', label: '15' },
                                { value: '20', label: '20 (High Quality)' },
                                { value: '23', label: '23 (Normal Quality)' },
                                { value: '26', label: '26' },
                                { value: '30', label: '30 (Low Quality)' },
                                { value: '35', label: '35' },
                                { value: '40', label: '40' },
                                { value: '45', label: '45' },
                                { value: '51', label: '51 (Lowest Quality)' },
                              ]
                            : [{ value: '23', label: '23 (Normal Quality)' }]
                    }
                    value={String(settings.clipQualityGpu)}
                    onChange={(val) => updateSettings({ clipQualityGpu: Number(val) })}
                  />
                </div>
              )}

              {/* Codec */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Codec</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip codec"
                  items={[
                    { value: 'h264', label: 'H.264' },
                    { value: 'h265', label: 'H.265' },
                    ...(settings.clipEncoder === 'cpu' || hasHardwareAv1
                      ? [
                          {
                            value: 'av1',
                            label:
                              settings.clipEncoder === 'cpu' ? 'AV1 (SVT-AV1 CPU)' : 'AV1 (GPU)',
                          },
                        ]
                      : []),
                  ]}
                  value={settings.clipCodec}
                  onChange={(val) => {
                    const newCodec = val as 'h264' | 'h265' | 'av1';
                    const updates: Partial<SettingsType> = { clipCodec: newCodec };
                    updates.clipQualityCpu = Math.min(
                      settings.clipQualityCpu,
                      newCodec === 'av1' ? 63 : 51,
                    );

                    if (settings.clipEncoder === 'cpu') {
                      if (newCodec === 'av1') {
                        updates.clipPreset = 'svt-6' as ClipPreset;
                        updates.clipVideoBitrate = 400;
                        if (settings.clipQualityCpu < 24) updates.clipQualityCpu = 30;
                      } else if (String(settings.clipPreset).startsWith('svt-')) {
                        updates.clipPreset = 'veryfast' as ClipPreset;
                        updates.clipVideoBitrate = newCodec === 'h265' ? 4000 : 8000;
                      }
                    }

                    // Auto-adjust preset when switching to/from AV1 on NVIDIA
                    if (settings.clipEncoder === 'gpu' && appState.gpuVendor === GpuVendor.Nvidia) {
                      if (
                        newCodec === 'av1' &&
                        !['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].includes(settings.clipPreset)
                      ) {
                        // Switching to AV1, set default AV1 preset
                        updates.clipPreset = 'p4' as ClipPreset;
                      } else if (
                        newCodec !== 'av1' &&
                        ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].includes(settings.clipPreset)
                      ) {
                        // Switching from AV1 to H.264/H.265, set default preset
                        updates.clipPreset = 'hq' as ClipPreset;
                      }
                    }

                    updateSettings(updates);
                  }}
                  disabled={settings.clipEncoder === 'gpu' && !appState.hasLoadedObs}
                />
              </div>

              {/* Video bitrate */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Video bitrate</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip video bitrate"
                  items={clipBitrateItems}
                  value={String(settings.clipVideoBitrate)}
                  onChange={(val) => updateSettings({ clipVideoBitrate: Number(val) })}
                />
                <p className="mt-2 text-xs text-base-content/70">
                  A target bitrate controls file size and overrides the quality value above.
                  Quality-based encoding lets file size vary with the content.
                </p>
              </div>

              {/* Resolution */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Resolution</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip resolution"
                  items={[
                    { value: 'Original', label: 'Original Resolution' },
                    { value: '480p', label: '480p' },
                    { value: '720p', label: '720p' },
                    { value: '1080p', label: '1080p' },
                    { value: '1440p', label: '1440p' },
                    { value: '4K', label: '4K' },
                  ]}
                  value={settings.clipResolution}
                  onChange={(val) => updateSettings({ clipResolution: val as ClipResolution })}
                />
              </div>

              {/* FPS */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Frame rate (fps)</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip frame rate"
                  items={[
                    { value: '0', label: 'Same as source' },
                    { value: '24', label: '24 FPS' },
                    { value: '30', label: '30 FPS' },
                    { value: '60', label: '60 FPS' },
                    { value: '120', label: '120 FPS' },
                    { value: '144', label: '144 FPS' },
                  ]}
                  value={String(settings.clipFps)}
                  onChange={(val) => updateSettings({ clipFps: Number(val) as ClipFPS })}
                />
              </div>

              {/* Audio Quality */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Audio bitrate</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip audio bitrate"
                  items={[
                    { value: '64k', label: '64 kbps (Tiny)' },
                    { value: '96k', label: '96 kbps (Low)' },
                    { value: '128k', label: '128 kbps (Medium)' },
                    { value: '192k', label: '192 kbps (High)' },
                    { value: '256k', label: '256 kbps (Very High)' },
                    { value: '320k', label: '320 kbps' },
                  ]}
                  value={settings.clipAudioQuality}
                  onChange={(val) =>
                    updateSettings({
                      clipAudioQuality: val as ClipAudioQuality,
                    })
                  }
                />
              </div>

              {/* Audio codec */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Audio codec</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip audio codec"
                  items={[
                    { value: 'opus', label: 'Opus' },
                    { value: 'aac', label: 'AAC' },
                  ]}
                  value={settings.clipAudioCodec}
                  onChange={(val) => updateSettings({ clipAudioCodec: val as ClipAudioCodec })}
                />
              </div>

              {/* Preset */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-base-content">Encoding speed / mode</span>
                </label>
                <DropdownSelect
                  ariaLabel="Clip encoder preset"
                  items={getAvailablePresets(
                    settings.clipEncoder,
                    settings.clipCodec,
                    appState.gpuVendor,
                  )}
                  value={settings.clipPreset}
                  placeholder="Choose a compatible encoding mode"
                  onChange={(val) => updateSettings({ clipPreset: val as ClipPreset })}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keep Separate Audio Tracks */}
      {settings.enableSeparateAudioTracks && (
        <div className="flex items-center mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="clipKeepSeparateAudioTracks"
              checked={settings.clipKeepSeparateAudioTracks}
              onChange={(e) => updateSettings({ clipKeepSeparateAudioTracks: e.target.checked })}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="cursor-pointer">Keep separate audio tracks</span>
          </label>
        </div>
      )}
    </div>
  );
}
