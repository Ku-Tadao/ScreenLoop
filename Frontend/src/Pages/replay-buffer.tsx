import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FolderOpen, Mic2, MonitorPlay, Save, Volume2 } from 'lucide-react';
import { useAppState } from '../Context/AppStateContext';
import { useSettings } from '../Context/SettingsContext';
import { useSelectedMenu } from '../Context/SelectedMenuContext';
import { useSelectedVideo } from '../Context/SelectedVideoContext';
import { Content } from '../Models/types';
import { sendMessageToBackend } from '../Utils/MessageUtils';
import { useWebSocketContext } from '../Context/WebSocketContext';

function formatDuration(duration: string): string {
  const time = duration.split('.')[0];
  const parts = time.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '00:00';
  const [hours, minutes, seconds] = parts;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function relativeTime(dateString: string, nowMs: number): string {
  const created = new Date(dateString).getTime();
  if (Number.isNaN(created) || nowMs <= 0) return '';
  const seconds = Math.max(1, Math.floor((nowMs - created) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RecentCaptureCard({
  item,
  cacheFolder,
  nowMs,
  onOpen,
}: {
  item: Content;
  cacheFolder: string;
  nowMs: number;
  onOpen: () => void;
}) {
  const thumbnailPath = `${cacheFolder}/thumbnails/Replay Buffers/${item.fileName}.jpeg`;
  const thumbnailUrl = `http://localhost:2222/api/thumbnail?input=${encodeURIComponent(thumbnailPath)}`;

  return (
    <button
      className="capture-card group w-full min-w-0 overflow-hidden rounded-xl border border-screen-line/60 bg-screen-surface text-left transition-colors hover:border-primary/60"
      onClick={onOpen}
    >
      <div className="relative aspect-video overflow-hidden bg-base-100">
        <MonitorPlay
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-screen-muted/40"
        />
        <img
          alt=""
          className="relative h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden';
          }}
          onLoad={(event) => {
            event.currentTarget.style.visibility = 'visible';
          }}
          draggable={false}
          src={thumbnailUrl}
        />
        <span className="absolute bottom-2 right-2 rounded border border-screen-line bg-screen-deep/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-100">
          {formatDuration(item.duration)}
        </span>
      </div>
      <div className="p-4">
        <h4 className="mb-1 truncate text-sm font-semibold text-slate-100">
          {item.title || item.fileName}
        </h4>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-screen-muted">
            {relativeTime(item.createdAt, nowMs)}
          </span>
          <span className="text-[11px] font-medium text-screen-muted">{item.fileSize}</span>
        </div>
      </div>
    </button>
  );
}

export default function ReplayBuffer() {
  const appState = useAppState();
  const settings = useSettings();
  const { setSelectedMenu } = useSelectedMenu();
  const { setSelectedVideo } = useSelectedVideo();
  const { isConnected } = useWebSocketContext();
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const intervalId = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const isRecording = Boolean(appState.recording || appState.preRecording);
  const buffers = useMemo(
    () =>
      appState.content
        .filter((item) => item.type === 'Buffer')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [appState.content],
  );
  const recentBuffers = buffers.slice(0, 3);

  const statusLabel = !isConnected
    ? 'Reconnecting to ScreenLoop'
    : !appState.hasLoadedObs
      ? 'Preparing Capture Engine'
      : isRecording
        ? 'Recording Active'
        : 'Ready to Capture';
  const qualityLabel = `${settings.resolution.toUpperCase()} / ${settings.frameRate}FPS`;
  const bufferMinutes = Math.floor(settings.replayBufferDuration / 60);
  const bufferSeconds = settings.replayBufferDuration % 60;
  const bufferLabel = `${bufferMinutes.toString().padStart(2, '0')}:${bufferSeconds
    .toString()
    .padStart(2, '0')}`;

  return (
    <div className="workspace-page h-full overflow-y-auto">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Capture workspace</p>
          <h1>Replay Buffer</h1>
          <p className="mt-2 text-sm text-screen-muted">
            Keep the moment. Save it when it matters.
          </p>
        </div>
        <div className="capture-status" role="status">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${isRecording ? 'bg-screen-red' : isConnected && appState.hasLoadedObs ? 'bg-primary' : 'bg-warning'}`}
          />
          {statusLabel}
        </div>
      </header>

      <main>
        <section className="buffer-panel" aria-label="Replay buffer status">
          <div className="buffer-main">
            <div className="flex items-center justify-between gap-4">
              <span className="eyebrow">Rolling capture</span>
              <MonitorPlay className="h-5 w-5 text-screen-muted" aria-hidden="true" />
            </div>
            <div className="buffer-time">{bufferLabel}</div>
            <p className="text-sm text-screen-muted">Buffer length · minutes : seconds</p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <button
                className="btn btn-primary gap-2 px-5"
                disabled={!isConnected || !appState.hasLoadedObs || !isRecording}
                title={
                  !isRecording
                    ? 'Start capture to save a replay'
                    : 'Save the recent buffer to your library'
                }
                onClick={() => sendMessageToBackend('SaveReplayBuffer')}
              >
                <Save className="h-4 w-4" />
                Save Replay
              </button>
              <span className="text-xs text-screen-muted">Saved to your local library</span>
            </div>
          </div>
          <div className="buffer-details">
            <div>
              <p className="eyebrow">Recording quality</p>
              <p className="mt-2 text-lg font-medium tabular-nums">{qualityLabel}</p>
            </div>
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-screen-muted">
                <Volume2 className="h-4 w-4" aria-hidden="true" /> System audio
              </div>
              <meter
                className="audio-meter"
                min={0}
                max={1}
                value={isConnected && isRecording ? appState.systemAudioLevel : 0}
                aria-label="System audio level"
              />
            </div>
            <button
              className="text-left text-sm font-medium text-primary hover:underline"
              onClick={() => setSelectedMenu('Settings')}
            >
              Adjust recording settings <ArrowUpRight className="inline h-4 w-4" />
            </button>
          </div>
        </section>

        <div className="capture-shortcuts">
          <button
            disabled={!isConnected}
            onClick={() => sendMessageToBackend('ImportFile', { sectionId: 'replayBuffer' })}
          >
            <FolderOpen className="h-5 w-5" />
            <span>
              Import Recording<span className="shortcut-description">Bring in a local file</span>
            </span>
            <ArrowUpRight className="ml-auto h-4 w-4" />
          </button>
          <button onClick={() => setSelectedMenu('Settings')}>
            <Mic2 className="h-5 w-5" />
            <span>
              Mic Control<span className="shortcut-description">Manage audio devices</span>
            </span>
            <ArrowUpRight className="ml-auto h-4 w-4" />
          </button>
        </div>

        <section className="mt-10" aria-labelledby="recent-captures">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="recent-captures" className="text-lg font-semibold">
                Recent Captures
              </h2>
              <p className="mt-1 text-xs text-screen-muted">{buffers.length} saved locally</p>
            </div>
            <button
              className="flex items-center gap-2 text-sm text-primary hover:underline"
              onClick={() => setSelectedMenu('Clips')}
            >
              View Clip Manager <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div className="capture-grid">
            {recentBuffers.map((item) => (
              <RecentCaptureCard
                key={item.fileName}
                item={item}
                cacheFolder={appState.cacheFolder}
                nowMs={nowMs}
                onOpen={() => setSelectedVideo(item)}
              />
            ))}
          </div>
          {recentBuffers.length === 0 && (
            <div className="empty-library">
              <MonitorPlay className="h-9 w-9 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">Your next moment belongs here</h3>
              <p className="mt-2 text-sm text-screen-muted">
                Start capture, then save a replay when something worth keeping happens.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
