import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import './index.css';
import { ThemeProvider } from './lib/theme.tsx';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import { Layout } from './components/Layout.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { CardBrowserPage } from './pages/CardBrowserPage.tsx';
import { LocalPlayPage } from './pages/LocalPlayPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SettingsProvider } from './lib/settings.tsx';

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/cards', element: <CardBrowserPage /> },
      { path: '/play/local', element: <LocalPlayPage /> },
      { path: '/settings', element: <SettingsPage /> },
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
