import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import App from './App.tsx';
import { SelectedVideoProvider } from './Context/SelectedVideoContext.tsx';
import { SelectedMenuProvider } from './Context/SelectedMenuContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SelectedVideoProvider>
      <SelectedMenuProvider>
        <App />
      </SelectedMenuProvider>
    </SelectedVideoProvider>
  </StrictMode>,
);
