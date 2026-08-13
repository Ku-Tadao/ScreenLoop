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
import { useRef, useLayoutEffect, useState, useMemo } from 'react';
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
  const { isConnected } = useWebSocketContext();
  const [buttonCooldown, setButtonCooldown] = useState(false);

  const buttonRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [indicatorPosition, setIndicatorPosition] = useState({ top: 12 });

  const visibleMenuItems = useMemo(() => {
    const items =
      settings.menuItems && settings.menuItems.length > 0 ? settings.menuItems : DEFAULT_MENU_ITEMS;
    // Force-show items that contain content so the user always has a way to reach their files.
    return items.filter(
      (item) =>
        item.id === 'Settings' || item.visible || menuItemHasContent(item.id, appState.content),
    );
  }, [settings.menuItems, appState.content]);

  const computeIndicatorPosition = () => {
    if (!visibleMenuItems.some((item) => item.id === selectedMenu)) return;
    const rowEl = buttonRefs.current[selectedMenu];
    if (!rowEl) return;
    const buttonEl = rowEl.firstElementChild as HTMLElement | null;
    const buttonHeight = buttonEl?.offsetHeight || 48;
    const indicatorTop = rowEl.offsetTop + buttonHeight / 2 - 20;
    setIndicatorPosition({ top: indicatorTop });
  };

  useLayoutEffect(() => {
    // Skip while the active row is mid-exit (App.tsx will redirect selectedMenu to a
    // fallback on the next tick). Otherwise we'd read a stale layout for one frame.
    computeIndicatorPosition();
    // After the row enter/exit animation finishes (200ms), recompute. Showing a row
    // grows its height over the animation window so rows below settle into their final
    // offsetTop only at the end — this second pass corrects the indicator to match.
    const timeoutId = setTimeout(computeIndicatorPosition, 220);
    return () => clearTimeout(timeoutId);
  }, [selectedMenu, visibleMenuItems]);

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
    <div className="bg-screen-surface w-60 h-screen flex flex-col border-r border-screen-line">
      <div className="flex shrink-0 items-center justify-between border-b border-screen-line px-3 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-primary">ScreenLoop</h1>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isConnected
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-warning/50 bg-warning/10 text-warning'
          }`}
          role="status"
          aria-live="polite"
        >
          {isConnected ? 'Online' : 'Reconnecting'}
        </span>
      </div>
      {/* Menu Items */}
      <div className="relative flex shrink-0 flex-col gap-1 px-2 py-4 text-left">
        {/* Selection indicator rectangle */}
        <div className="hidden" style={{ top: `${indicatorPosition.top}px` }} />
        <AnimatePresence initial={false} mode="popLayout">
          {visibleMenuItems.map(({ id }) => {
            const Icon = MENU_ICONS[id];
            const isActive = selectedMenu === id;

            const buttonNode = (
              <Button
                variant="nav"
                className={`rounded border px-3 py-2 text-xs font-semibold uppercase tracking-[0.05em] ${
                  isActive
                    ? 'border-primary bg-screen-raised text-primary shadow-[inset_0_0_18px_rgba(99,247,255,0.08)]'
                    : 'border-transparent text-screen-muted hover:border-screen-line hover:bg-screen-raised hover:text-primary'
                }`}
                onClick={() => onSelectMenu(id)}
              >
                <Icon className="w-5 h-5" />
                {id}
              </Button>
            );

            return (
              <motion.div
                key={id}
                ref={(el) => {
                  buttonRefs.current[id] = el;
                }}
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
      </div>

      {/* Status Cards */}
      <div className="min-h-0 grow overflow-y-auto overscroll-contain">
        <div className="space-y-2 p-2">
          <div className="rounded border border-screen-line bg-screen-deep p-3">
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
          </div>
          <AnimatePresence>
            {updateInfo && (
              <AnimatedCard key="update-card">
                <UpdateCard />
              </AnimatedCard>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {Object.values(useImports().imports).map((importItem) => (
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
        className="m-3 h-11 shrink-0 rounded border border-primary bg-primary text-sm font-semibold uppercase tracking-[0.05em] text-primary-content transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}
