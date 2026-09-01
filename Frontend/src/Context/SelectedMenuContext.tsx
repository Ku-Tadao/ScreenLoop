import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { SETTINGS_STORAGE_KEY } from './SettingsContext';

interface SelectedMenuContextValue {
  selectedMenu: string;
  setSelectedMenu: (menu: string) => void;
}

const SelectedMenuContext = createContext<SelectedMenuContextValue | undefined>(undefined);

// 'Full Sessions' only appears when legacy session recordings exist, so starting there
// would flash an empty page before App.tsx redirects to a reachable item.
const defaultMenu = 'Replay Buffer';

const readCachedDefaultMenu = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const candidate = cached?.defaultMenuItem;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
  } catch {
    return null;
  }
};

const getInitialMenu = () => {
  if (typeof window === 'undefined') {
    return defaultMenu;
  }

  const stored = (window as typeof window & { __selectedMenu?: string }).__selectedMenu;
  if (stored) return stored;

  return readCachedDefaultMenu() ?? defaultMenu;
};

export const SelectedMenuProvider = ({ children }: { children: ReactNode }) => {
  const [selectedMenuState, setSelectedMenuState] = useState<string>(getInitialMenu);

  const setSelectedMenu = useCallback((menu: string) => {
    setSelectedMenuState(menu);
    if (typeof window !== 'undefined') {
      (window as typeof window & { __selectedMenu?: string }).__selectedMenu = menu;
    }
  }, []);

  return (
    <SelectedMenuContext.Provider value={{ selectedMenu: selectedMenuState, setSelectedMenu }}>
      {children}
    </SelectedMenuContext.Provider>
  );
};

export const useSelectedMenu = () => {
  const context = useContext(SelectedMenuContext);
  if (!context) {
    throw new Error('useSelectedMenu must be used within a SelectedMenuProvider');
  }

  return context;
};
