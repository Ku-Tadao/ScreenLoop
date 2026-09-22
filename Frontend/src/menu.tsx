import { useSettings } from './Context/SettingsContext';
import { useAppState } from './Context/AppStateContext';
import RecordingCard from './Components/RecordingCard';
import { sendMessageToBackend } from './Utils/MessageUtils';
import { useImports } from './Context/ImportContext';
import { useClipping } from './Context/ClippingContext';
import { useUpdate } from './Context/UpdateContext';
import { useObsDownload } from './Context/ObsDownloadContext';
import ImportCard from './Components/ImportCard';
import ClippingCard from './Components/ClippingCard';
import UpdateCard from './Components/UpdateCard';
import UnavailableDeviceCard from './Components/UnavailableDeviceCard';
import AnimatedCard from './Components/AnimatedCard';
import { Clapperboard, Settings, History, Play, LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import Button from './Components/Button';
import { MenuItemId, DEFAULT_MENU_ITEMS, menuItemHasContent } from './Models/types';
import { useWebSocketContext } from './Context/WebSocketContext';

interface MenuProps {
  selectedMenu: string;
  onSelectMenu: (menu: string) => void;
}

const MENU_ICONS: Record<MenuItemId, LucideIcon> = {
  'Full Sessions': Play,
  'Replay Buffer': History,
  Clips: Clapperboard,
  Settings: Settings,
};

export default function Menu({ selectedMenu, onSelectMenu }: MenuProps) {
  const settings = useSettings();
  const appState = useAppState();
  const { hasLoadedObs, recording, preRecording } = appState;
  const { updateInfo } = useUpdate();
  const { obsDownloadProgress } = useObsDownload();
  const { imports } = useImports();
  const { isConnected } = useWebSocketContext();
  const [buttonCooldown, setButtonCooldown] = useState(false);

  const visibleMenuItems = useMemo(() => {
    const items =
      settings.menuItems && settings.menuItems.length > 0 ? settings.menuItems : DEFAULT_MENU_ITEMS;
    // Force-show items that contain content so the user always has a way to reach their files.
    return items.filter(
      (item) =>
        item.id === 'Settings' || item.visible || menuItemHasContent(item.id, appState.content),
    );
  }, [settings.menuItems, appState.content]);

  const hasUnavailableDevices = () => {
    const unavailableInput = settings.inputDevices.some(
      (deviceSetting: { id: string }) =>
        deviceSetting.id !== 'default' &&
        !appState.inputDevices.some((d) => d.id === deviceSetting.id),
    );
    const unavailableOutput = settings.outputDevices.some(
      (deviceSetting: { id: string }) =>
        deviceSetting.id !== 'default' &&
        !appState.outputDevices.some((d) => d.id === deviceSetting.id),
    );
    return unavailableInput || unavailableOutput;
  };

  const rawStoragePercent =
    settings.storageLimit > 0
      ? Math.min(100, (appState.currentFolderSizeGb / settings.storageLimit) * 100)
      : 0;
  const storagePercent =
    rawStoragePercent > 0 && rawStoragePercent < 1 ? '<1' : String(Math.round(rawStoragePercent));
  const storageBarPercent =
    rawStoragePercent > 0 ? Math.max(1, Math.min(100, rawStoragePercent)) : 0;

  return (
    <aside className="app-sidebar h-full flex flex-col border-r border-screen-line/60">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-base-content">ScreenLoop</h1>
        <span
          className={`connection-status text-[10px] font-medium ${
            isConnected ? 'text-primary' : 'text-warning'
          }`}
          role="status"
          aria-live="polite"
        >
          {isConnected ? 'Online' : 'Reconnecting'}
        </span>
      </div>
      {/* Menu Items */}
      <nav
        aria-label="Main navigation"
        className="relative flex shrink-0 flex-col gap-1 px-3 pb-6 pt-2 text-left"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visibleMenuItems.map(({ id }) => {
            const Icon = MENU_ICONS[id];
            const isActive = selectedMenu === id;

            const buttonNode = (
              <Button
                variant="nav"
                aria-current={isActive ? 'page' : undefined}
                className={`sidebar-link ${isActive ? 'is-active' : ''}`}
                onClick={() => onSelectMenu(id)}
              >
                <Icon className="w-5 h-5" />
                <span>{id}</span>
              </Button>
            );

            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className={`overflow-hidden ${id === 'Settings' ? 'mt-auto' : ''}`}
              >
                {buttonNode}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </nav>

      {/* Status Cards */}
      <div className="min-h-0 grow overflow-y-auto overscroll-contain">
        <div className="space-y-2 p-2">
          <div className="sidebar-storage rounded-lg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.05em] text-screen-muted">
                Storage
              </span>
              <span className="text-[11px] font-medium text-primary">{storagePercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-screen-surface">
              <div
                className="h-full rounded bg-primary"
                style={{ width: `${storageBarPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-screen-muted tabular-nums">
              {appState.currentFolderSizeGb.toFixed(1)} GB / {settings.storageLimit} GB
            </p>
          </div>
          <AnimatePresence>
            {updateInfo && (
              <AnimatedCard key="update-card">
                <UpdateCard />
              </AnimatedCard>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {Object.values(imports).map((importItem) => (
              <AnimatedCard key={importItem.id}>
                <ImportCard importItem={importItem} />
              </AnimatedCard>
            ))}
          </AnimatePresence>

          {/* Show warning if there are unavailable audio devices */}
          <AnimatePresence>
            {hasUnavailableDevices() && (
              <AnimatedCard key="unavailable-device-card">
                <UnavailableDeviceCard />
              </AnimatedCard>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(preRecording || (recording && recording.endTime == null)) && (
              <AnimatedCard key="recording-card">
                <RecordingCard recording={recording} preRecording={preRecording} />
              </AnimatedCard>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {Object.values(useClipping().clippingProgress).map((clipping) => (
              <AnimatedCard key={clipping.id}>
                <ClippingCard clipping={clipping} />
              </AnimatedCard>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* OBS Loading Section */}
      {!hasLoadedObs && (
        <div className="mb-4 flex shrink-0 flex-col items-center px-4">
          {obsDownloadProgress !== null && obsDownloadProgress < 100 ? (
            <>
              <p className="text-center text-sm text-gray-300 mb-2">Downloading OBS</p>
              <div className="w-full bg-base-200 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${obsDownloadProgress}%` }}
                ></div>
              </div>
              <p className="text-gray-500 text-xs mt-1">{obsDownloadProgress}%</p>
            </>
          ) : (
            <>
              <div
                style={{
                  width: '3.5rem',
                  height: '2rem',
                }}
                className="loading loading-infinity"
              ></div>
              <p className="text-center mt-2 disabled">Starting OBS</p>
            </>
          )}
        </div>
      )}

      <button
        className="capture-toggle m-4 h-11 shrink-0 rounded-lg bg-primary text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={
          buttonCooldown ||
          !isConnected ||
          !appState.hasLoadedObs ||
          (appState.recording && recording && recording.endTime !== null)
        }
        title={!isConnected ? 'Waiting for the ScreenLoop backend to reconnect' : undefined}
        onClick={() => {
          setButtonCooldown(true);
          setTimeout(() => setButtonCooldown(false), 1000);
          sendMessageToBackend(
            appState.recording || appState.preRecording ? 'StopRecording' : 'StartRecording',
          );
        }}
      >
        {appState.recording || appState.preRecording ? 'Stop Recording' : 'Start Capture'}
      </button>
    </aside>
  );
}
