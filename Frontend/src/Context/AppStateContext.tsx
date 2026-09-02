import { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { State, initialState } from '../Models/types';

const AppStateContext = createContext<State>(initialState);

export function useAppState(): State {
  return useContext(AppStateContext);
}

interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const STORAGE_KEY = 'ScreenLoop.appstate.v1';

  const loadCachedState = (): State => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialState;
      const cached = JSON.parse(raw);
      const revived: State = { ...initialState, ...cached };
      // Do not restore live recording info from cache
      revived.recording = undefined;
      revived.preRecording = undefined;
      revived.hasLoadedObs = false;
      return revived;
    } catch {
      return initialState;
    }
  };

  const [appState, setAppState] = useState<State>(() => loadCachedState());

  // The backend pushes state several times a second while recording (audio meter), and the
  // payload includes the whole content library. Serializing that on every message is the
  // most expensive thing this context does, so coalesce writes and skip live-only fields
  // that loadCachedState throws away anyway.
  const pendingStateRef = useRef<State | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const scheduleCacheSave = (value: State) => {
    pendingStateRef.current = value;
    if (saveTimerRef.current !== null) return;

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const snapshot = pendingStateRef.current;
      pendingStateRef.current = null;
      if (!snapshot) return;

      try {
        const persisted: Partial<State> = { ...snapshot };
        delete persisted.recording;
        delete persisted.preRecording;
        delete persisted.systemAudioLevel;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      } catch {
        // ignore caching errors
      }
    }, 1000);
  };

  useEffect(() => {
    const handleWebSocketMessage = (event: CustomEvent<any>) => {
      const data = event.detail;

      if (data.method === 'State') {
        setAppState((prev) => {
          const next: State = { ...prev, ...data.content };
          scheduleCacheSave(next);
          return next;
        });
      } else if (data.method === 'SystemAudioLevel') {
        // High-frequency meter update: merge the single field and never cache it.
        const level = Number(data.content?.level);
        if (Number.isFinite(level)) {
          setAppState((prev) =>
            prev.systemAudioLevel === level ? prev : { ...prev, systemAudioLevel: level },
          );
        }
      }
    };

    window.addEventListener('websocket-message', handleWebSocketMessage as EventListener);
    return () => {
      window.removeEventListener('websocket-message', handleWebSocketMessage as EventListener);
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  return <AppStateContext.Provider value={appState}>{children}</AppStateContext.Provider>;
}
