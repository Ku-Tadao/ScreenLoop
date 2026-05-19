import { useEffect } from 'react';
import { Settings as SettingsType } from '../../Models/types';

interface CaptureModeSectionProps {
  settings: SettingsType;
  updateSettings: (updates: Partial<SettingsType>) => void;
}

export default function CaptureModeSection({ settings, updateSettings }: CaptureModeSectionProps) {
  useEffect(() => {
    if (settings.recordingMode !== 'Buffer') {
      updateSettings({ recordingMode: 'Buffer' });
    }
  }, [settings.recordingMode, updateSettings]);

  return (
    <div className="p-4 bg-base-300 rounded-lg shadow-md border border-custom">
      <h2 className="text-xl font-semibold mb-4">Capture Mode</h2>
      <div className="bg-base-200 p-4 rounded-lg flex flex-col border border-primary">
        <div className="text-lg font-semibold mb-3">Replay Buffer</div>
        <div className="text-sm text-left text-base-content">
          <p className="mb-2">
            Continuously records the selected display in the background. Save recent footage with a
            hotkey whenever you need it.
          </p>
          <div className="text-xs text-base-content text-opacity-70">
            * Efficient storage usage
            <br />
            * Always uses display capture
            <br />* Local files only
          </div>
        </div>
      </div>
    </div>
  );
}
