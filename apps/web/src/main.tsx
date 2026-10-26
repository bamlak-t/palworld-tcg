import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import './index.css';
import { ThemeProvider } from './lib/theme.tsx';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import { Layout } from './components/Layout.tsx';
import { CardBrowserPage } from './pages/CardBrowserPage.tsx';
import { DecksPage } from './pages/DecksPage.tsx';
import { LocalPlayPage } from './pages/LocalPlayPage.tsx';
import { OnlineGamePage } from './pages/OnlineGamePage.tsx';
import { PlayPage } from './pages/PlayPage.tsx';
import { SettingsProvider } from './lib/settings.tsx';

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <PlayPage /> },
      { path: '/cards', element: <CardBrowserPage /> },
      { path: '/decks', element: <DecksPage /> },
      { path: '/play', element: <Navigate to="/" replace /> },
      { path: '/play/local', element: <LocalPlayPage /> },
      { path: '/play/:code', element: <OnlineGamePage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <SettingsProvider>
          <RouterProvider router={router} />
        </SettingsProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
