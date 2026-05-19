import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { Settings as SettingsType } from '../../Models/types';
import { sendMessageToBackend } from '../../Utils/MessageUtils';
import { useAppState } from '../../Context/AppStateContext';

interface StorageSettingsSectionProps {
  settings: SettingsType;
  updateSettings: (updates: Partial<SettingsType>) => void;
}

export default function StorageSettingsSection({
  settings,
  updateSettings,
}: StorageSettingsSectionProps) {
  const appState = useAppState();
  const [localStorageLimit, setLocalStorageLimit] = useState(String(settings.storageLimit));
  const maxStorageLimit =
    appState.contentDriveTotalGb > 0 ? Math.max(1, Math.floor(appState.contentDriveTotalGb)) : 500;
  const storageHeadroomGb = settings.storageLimit * 0.2;
  const autoManageStartGb = settings.storageLimit - storageHeadroomGb;
  const folderUsedPercent =
    settings.storageLimit > 0
      ? Math.min(100, (appState.currentFolderSizeGb / settings.storageLimit) * 100)
      : 0;
  const autoManageStartPercent = 80;
  const limitPercentOfDrive =
    appState.contentDriveTotalGb > 0
      ? Math.min(100, (settings.storageLimit / appState.contentDriveTotalGb) * 100)
      : 0;
  const driveUsedPercent =
    appState.contentDriveTotalGb > 0
      ? Math.min(
          100,
          ((appState.contentDriveTotalGb - appState.contentDriveFreeGb) /
            appState.contentDriveTotalGb) *
            100,
        )
      : 0;

  useEffect(() => {
    setLocalStorageLimit(String(settings.storageLimit));
  }, [settings.storageLimit]);

  const commitStorageLimit = (value: string) => {
    const numericLimit = Math.min(
      maxStorageLimit,
      Math.max(1, Math.round(Number(value) || settings.storageLimit || 10)),
    );
    setLocalStorageLimit(String(numericLimit));
    updateSettings({ storageLimit: numericLimit });
  };

  return (
    <section className="mx-auto max-w-3xl py-4 text-center">
      <h2 className="text-3xl font-semibold text-slate-200">Allocate disk space</h2>
      <p className="mt-1 text-lg text-screen-muted">Keep ScreenLoop captures under control.</p>

      <div className="mt-8 rounded-lg border border-screen-line bg-screen-surface p-6 text-left shadow-[inset_0_0_40px_rgba(99,247,255,0.025)]">
        <div className="flex gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded bg-screen-raised">
            <HardDrive className="h-8 w-8 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold text-slate-200">Auto manage</h3>
            <p className="mt-1 max-w-md text-sm text-screen-muted">
              Automatically deletes the oldest ScreenLoop captures when the media folder passes the
              limit. Favorites, imported files, and manually added videos are protected.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-screen-line bg-screen-main p-3">
            <div className="text-xs uppercase text-screen-muted">Drive capacity</div>
            <div className="mt-1 text-xl font-semibold text-slate-200">
              {appState.contentDriveTotalGb > 0
                ? `${appState.contentDriveTotalGb.toFixed(2)} GB`
                : 'Unknown'}
            </div>
          </div>
          <div className="rounded-lg border border-screen-line bg-screen-main p-3">
            <div className="text-xs uppercase text-screen-muted">Free space</div>
            <div className="mt-1 text-xl font-semibold text-primary">
              {appState.contentDriveFreeGb.toFixed(2)} GB
            </div>
          </div>
          <div className="rounded-lg border border-screen-line bg-screen-main p-3">
            <div className="text-xs uppercase text-screen-muted">Auto-manage starts</div>
            <div className="mt-1 text-xl font-semibold text-slate-200">
              {autoManageStartGb.toFixed(2)} GB used
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-screen-muted">
            <span>Drive usage</span>
            <span>
              {driveUsedPercent.toFixed(1)}% used
              {limitPercentOfDrive > 0 && `, ScreenLoop limit is ${limitPercentOfDrive.toFixed(1)}%`}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-screen-deep">
            <div className="h-full bg-primary" style={{ width: `${driveUsedPercent}%` }} />
            {limitPercentOfDrive > 0 && (
              <div
                className="absolute top-0 h-full w-px bg-slate-200/80"
                style={{ left: `${limitPercentOfDrive}%` }}
                title="Selected ScreenLoop media-folder limit as a share of this drive"
              />
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-screen-line bg-screen-main p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-lg text-slate-300">Media folder size limit</span>
            <span className="text-sm text-screen-muted">
              {appState.currentFolderSizeGb.toFixed(2)} GB used
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              aria-label="Media folder size limit"
              className="range range-xs flex-1 accent-primary"
              max={maxStorageLimit}
              min="1"
              type="range"
              value={Math.min(maxStorageLimit, Number(localStorageLimit) || 1)}
              onChange={(e) => setLocalStorageLimit(e.target.value)}
              onMouseUp={(e) => commitStorageLimit(e.currentTarget.value)}
              onTouchEnd={(e) => commitStorageLimit(e.currentTarget.value)}
            />
            <input
              className="h-10 w-24 border border-screen-line bg-screen-surface px-3 text-right text-lg text-slate-200"
              max={maxStorageLimit}
              min="1"
              type="number"
              value={localStorageLimit}
              onChange={(e) => setLocalStorageLimit(e.target.value)}
              onBlur={(e) => commitStorageLimit(e.target.value)}
            />
            <span className="text-screen-muted">GB</span>
          </div>
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-xs text-screen-muted">
              <span>Media folder usage</span>
              <span>{folderUsedPercent.toFixed(1)}% of selected limit</span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-screen-deep">
              <div className="h-full bg-primary" style={{ width: `${folderUsedPercent}%` }} />
              <div
                className="absolute top-0 h-full w-px bg-slate-200/80"
                style={{ left: `${autoManageStartPercent}%` }}
                title={`Auto-manage starts at ${autoManageStartGb.toFixed(2)} GB used`}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-between text-xs text-screen-muted">
            <span>
              Keeps {storageHeadroomGb.toFixed(2)} GB headroom inside the selected limit
            </span>
            <span>Slider max: drive capacity ({maxStorageLimit} GB)</span>
          </div>
        </div>
      </div>

      <div className="mt-8 text-left">
        <label className="mb-2 block text-xl text-slate-300">Media folder</label>
        <div className="flex gap-3">
          <input
            className="h-10 flex-1 rounded-lg border border-screen-line bg-screen-main px-3 text-screen-muted"
            value={settings.contentFolder}
            onChange={(e) => updateSettings({ contentFolder: e.target.value })}
          />
          <button
            type="button"
            className="h-10 border border-screen-line bg-screen-raised px-6 text-slate-200 hover:border-primary"
            onClick={() => sendMessageToBackend('SetVideoLocation')}
          >
            Change
          </button>
        </div>
      </div>

      <div className="mt-6 text-left">
        <label className="mb-2 block text-xl text-slate-300">Metadata/cache folder</label>
        <div className="flex gap-3">
          <input
            className="h-10 flex-1 rounded-lg border border-screen-line bg-screen-main px-3 text-screen-muted"
            value={settings.cacheFolder}
            onChange={(e) => updateSettings({ cacheFolder: e.target.value })}
          />
          <button
            type="button"
            className="h-10 border border-screen-line bg-screen-raised px-6 text-slate-200 hover:border-primary"
            onClick={() => sendMessageToBackend('SetCacheLocation')}
          >
            Change
          </button>
        </div>
      </div>
    </section>
  );
}
