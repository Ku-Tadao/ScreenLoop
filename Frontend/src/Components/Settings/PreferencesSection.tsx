import { useState, type SyntheticEvent } from 'react';
import { VolumeX, Volume2 } from 'lucide-react';
import { Settings as SettingsType } from '../../Models/types';

interface PreferencesSectionProps {
  settings: SettingsType;
  updateSettings: (updates: Partial<SettingsType>) => void;
}

export default function PreferencesSection({ settings, updateSettings }: PreferencesSectionProps) {
  const [draggingSoundVolume, setDraggingSoundVolume] = useState<number | null>(null);

  // Committing only on mouseup left keyboard adjustment (arrow keys) pending forever,
  // so the value snapped back and was never saved.
  const commitSoundVolume = (event: SyntheticEvent<HTMLInputElement>) => {
    if (draggingSoundVolume === null) return;
    updateSettings({ soundEffectsVolume: parseFloat(event.currentTarget.value) });
    setDraggingSoundVolume(null);
  };

  return (
    <div className="p-4 bg-base-300 rounded-lg shadow-md border border-custom">
      <h2 className="text-xl font-semibold mb-4">Startup and playback</h2>
      <div className="bg-base-200 px-4 py-3 rounded-lg space-y-3 border border-custom">
        <div className="flex items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="runOnStartup"
              checked={settings.runOnStartup}
              onChange={(e) => updateSettings({ runOnStartup: e.target.checked })}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="cursor-pointer">Start ScreenLoop with Windows</span>
          </label>
        </div>

        <div className="flex flex-col">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="runAsAdmin"
              checked={settings.runAsAdmin}
              onChange={(e) => updateSettings({ runAsAdmin: e.target.checked })}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="cursor-pointer">Run as administrator</span>
          </label>
          <span className="text-xs text-gray-400 ml-7">
            Needed for hotkeys in games that run as administrator, like League of Legends via
            WeGame. Turning it on restarts ScreenLoop with a Windows admin prompt.
          </span>
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="showAudioWaveformInTimeline"
              checked={settings.showAudioWaveformInTimeline}
              onChange={(e) => updateSettings({ showAudioWaveformInTimeline: e.target.checked })}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="cursor-pointer">Show audio waveforms in the player timeline</span>
          </label>
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="showNewBadgeOnVideos"
              checked={settings.showNewBadgeOnVideos}
              onChange={(e) => updateSettings({ showNewBadgeOnVideos: e.target.checked })}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="flex items-center gap-1 cursor-pointer">
              Show<span className="badge badge-primary badge-sm text-base-300 mx-1">NEW</span>
              badge on new recordings and replay buffers
            </span>
          </label>
        </div>

        <div className="pt-3 border-t border-custom">
          <span className="text-md mb-2 block">
            App sound effects volume
            {draggingSoundVolume !== null && ` (${Math.round(draggingSoundVolume * 100)}%)`}
          </span>
          <div className="flex items-center gap-3">
            <VolumeX className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              aria-label="Sound effects volume"
              type="range"
              name="soundEffectsVolume"
              min="0"
              max="1"
              step="0.02"
              value={draggingSoundVolume ?? settings.soundEffectsVolume}
              onChange={(e) => {
                setDraggingSoundVolume(parseFloat(e.target.value));
              }}
              onMouseDown={(e) => setDraggingSoundVolume(parseFloat(e.currentTarget.value))}
              onMouseUp={commitSoundVolume}
              onTouchEnd={commitSoundVolume}
              onKeyUp={commitSoundVolume}
              onBlur={commitSoundVolume}
              className="range range-xs range-primary w-26 [--range-fill:0]"
            />
            <Volume2 className="w-4 h-4 text-gray-400 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
