import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, Copy, FolderOpen, Mic2, MonitorPlay, Save } from 'lucide-react';
import { useAppState } from '../Context/AppStateContext';
import { useSettings } from '../Context/SettingsContext';
import { useSelectedMenu } from '../Context/SelectedMenuContext';
import { useSelectedVideo } from '../Context/SelectedVideoContext';
import { Content } from '../Models/types';
import { sendMessageToBackend } from '../Utils/MessageUtils';
import { useWebSocketContext } from '../Context/WebSocketContext';

const quietWaveformBars = [10, 14, 12, 18, 9, 16, 20, 13, 11, 17, 10, 18, 14, 20, 12, 16, 9, 18];

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
      className="group overflow-hidden rounded-lg border border-screen-line bg-screen-surface text-left transition-colors hover:border-primary"
      onClick={onOpen}
    >
      <div className="relative aspect-video border-b border-screen-line bg-screen-deep">
        <img
          alt=""
          className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
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
          <span className="text-[11px] font-medium text-primary">{item.fileSize}</span>
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
  const waveformBars = useMemo(() => {
    if (!isRecording) return quietWaveformBars;
    const level = Math.max(0.03, appState.systemAudioLevel);
    return quietWaveformBars.map((base, index) => {
      const motion = 0.45 + Math.abs(Math.sin(index * 0.82)) * 0.55;
      const lift = Math.round(level * (30 + motion * 34));
      return Math.max(8, Math.min(64, base + lift));
    });
  }, [appState.systemAudioLevel, isRecording]);
  const buffers = useMemo(
    () =>
      appState.content
        .filter((item) => item.type === 'Buffer')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [appState.content],
  );
  const recentBuffers = buffers.slice(0, 2);

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
    <div className="h-full overflow-y-auto bg-screen-deep text-base-content">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-screen-line bg-screen-deep px-6 py-4">
        <div
          className={`flex items-center gap-3 ${isRecording ? 'text-screen-red' : isConnected && appState.hasLoadedObs ? 'text-primary' : 'text-warning'}`}
        >
          <span
            className={`h-3 w-3 rounded-full ${isRecording ? 'pulse-red bg-screen-red' : isConnected && appState.hasLoadedObs ? 'bg-primary' : 'bg-warning'}`}
          />
          <span className="text-xl font-semibold">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {isRecording && (
            <button
              className="flex h-10 items-center gap-2 rounded border border-primary bg-primary px-4 text-xs font-semibold uppercase tracking-[0.05em] text-primary-content transition-transform active:scale-95"
              disabled={!isConnected || !appState.hasLoadedObs}
              onClick={() => sendMessageToBackend('SaveReplayBuffer')}
            >
              <Save className="h-4 w-4" />
              Save Replay
            </button>
          )}
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <section className="relative overflow-hidden rounded-lg border border-screen-line bg-screen-surface p-6 md:col-span-8">
            <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/4 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <h2 className="mb-1 text-2xl font-bold tracking-tight text-slate-100">
                  Replay Buffer
                </h2>
                <p className="text-sm text-screen-muted">
                  Continuous display loop. Recent footage is ready when you need it.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded border border-screen-line bg-screen-raised px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-100">
                  {qualityLabel}
                </span>
              </div>
            </div>

            <div className="relative z-10 mt-8 flex items-end gap-4">
              <div className="text-5xl font-bold tracking-tight text-primary">{bufferLabel}</div>
              <div className="pb-2 text-xs font-semibold uppercase tracking-[0.05em] text-screen-muted">
                Buffer Length
              </div>
            </div>

            <div className="relative z-10 mt-8 flex h-16 items-end gap-1 opacity-75">
              {waveformBars.map((height, index) => (
                <div
                  key={index}
                  className="w-2 rounded-t-sm bg-primary transition-[height] duration-150 ease-out"
                  style={{
                    height: `${height}px`,
                    opacity: isRecording ? 1 : 0.45,
                  }}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4 md:col-span-4">
            <button
              className="flex min-h-32 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-screen-line bg-screen-surface p-4 transition-colors hover:border-primary"
              disabled={!isConnected}
              onClick={() => sendMessageToBackend('ImportFile', { sectionId: 'replayBuffer' })}
            >
              <FolderOpen className="h-9 w-9 text-screen-muted" />
              <span className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-100">
                Import Recording
              </span>
              <span className="text-[11px] font-medium text-screen-muted">Local files</span>
            </button>
            <button
              className="flex min-h-32 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-screen-line bg-screen-surface p-4 transition-colors hover:border-primary hover:text-primary"
              onClick={() => setSelectedMenu('Settings')}
            >
              <Mic2 className="h-9 w-9 text-screen-muted" />
              <span className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-100">
                Mic Control
              </span>
              <span className="text-[11px] font-medium text-screen-muted">Audio settings</span>
            </button>
          </section>

          <div className="mt-4 flex items-center justify-between border-b border-screen-line pb-2 md:col-span-12">
            <h3 className="text-xl font-semibold text-slate-100">Recent Captures</h3>
            <button
              className="text-xs font-semibold uppercase tracking-[0.05em] text-primary hover:underline"
              onClick={() => setSelectedMenu('Clips')}
            >
              View Clip Manager
            </button>
          </div>

          {recentBuffers.map((item) => (
            <div key={item.fileName} className="md:col-span-4">
              <RecentCaptureCard
                item={item}
                cacheFolder={appState.cacheFolder}
                nowMs={nowMs}
                onOpen={() => setSelectedVideo(item)}
              />
            </div>
          ))}

          {recentBuffers.length === 0 && (
            <div className="rounded-lg border border-screen-line bg-screen-surface p-8 md:col-span-8">
              <MonitorPlay className="mb-4 h-10 w-10 text-screen-muted" />
              <h4 className="mb-1 text-base font-semibold text-slate-100">No captures yet</h4>
              <p className="max-w-prose text-sm text-screen-muted">
                Start capture, then save a replay when something worth keeping happens.
              </p>
            </div>
          )}

          <button
            className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-screen-line bg-screen-surface transition-colors hover:border-primary md:col-span-4"
            onClick={() => setSelectedMenu('Clips')}
          >
            <div className="text-center">
              {buffers.length > 0 ? (
                <Copy className="mx-auto mb-2 h-9 w-9 text-screen-muted" />
              ) : (
                <Camera className="mx-auto mb-2 h-9 w-9 text-screen-muted" />
              )}
              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-screen-muted">
                Open Clip Manager
              </p>
            </div>
          </button>

          {buffers.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-screen-line bg-screen-surface p-4 md:col-span-4">
              <Check className="h-5 w-5 text-primary" />
              <span className="text-sm text-screen-muted">
                {buffers.length} replay {buffers.length === 1 ? 'capture' : 'captures'} stored
                locally.
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
