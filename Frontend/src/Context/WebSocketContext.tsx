import { createContext, useContext, ReactNode, useMemo, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { sendMessageToBackend } from '../Utils/MessageUtils';

interface WebSocketContextType {
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketMessage {
  method: string;
  content: any;
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  // Ref to track if we've already handled a version mismatch (prevent multiple reloads)
  const versionCheckHandled = useRef(false);
  // Ref to track if this is a reconnection (not initial connection)
  const hasConnectedBefore = useRef(false);

  // Configure WebSocket with reconnection and heartbeat
  const { readyState } = useWebSocket('ws://localhost:44030/', {
    onOpen: () => {
      // Check if this is a reconnection
      if (hasConnectedBefore.current) {
        console.log('WebSocket reconnected after disconnect - resyncing state');
      } else {
        console.log('WebSocket connected for the first time');
        hasConnectedBefore.current = true;
      }

      sendMessageToBackend('NewConnection');
    },
    onClose: (event) => {
      console.warn('WebSocket closed:', event.code, event.reason);
    },
    onError: (event) => {
      console.error('WebSocket error:', event);
    },
    onMessage: (event) => {
      // The heartbeat reply is a bare string, not a JSON envelope.
      if (typeof event.data !== 'string' || event.data === 'pong') return;

      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        // Both of these arrive several times a second while recording.
        if (data.method !== 'RecordingPreviewFrame' && data.method !== 'SystemAudioLevel') {
          console.log('WebSocket message received:', data);
        }

        // Handle version check
        if (data.method === 'AppVersion' && !versionCheckHandled.current) {
          versionCheckHandled.current = true;
          const backendVersion = data.content?.version;

          if (backendVersion && backendVersion !== __APP_VERSION__) {
            console.log(
              `Version mismatch: Backend ${backendVersion}, Frontend ${__APP_VERSION__}. Reloading...`,
            );
            // Store the old version before reloading
            localStorage.setItem('oldAppVersion', __APP_VERSION__);
            window.location.reload();
            return;
          }
        }

        // Dispatch the message to all listeners
        window.dispatchEvent(
          new CustomEvent('websocket-message', {
            detail: data,
          }),
        );
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
    shouldReconnect: () => {
      console.log('WebSocket closed, will attempt to reconnect');
      return true;
    },
    reconnectAttempts: Infinity,
    reconnectInterval: 3000,
    heartbeat: {
      message: 'ping',
      returnMessage: 'pong',
      timeout: 30000,
      interval: 15000,
    },
  });

  // Memoized: SettingsProvider subscribes to this context, so a fresh object on
  // every render would re-render the whole app on each provider render.
  const isConnected = readyState === ReadyState.OPEN;
  const contextValue = useMemo(() => ({ isConnected }), [isConnected]);

  return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
