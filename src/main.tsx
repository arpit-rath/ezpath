import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './app/providers';
import { router } from './app/router';
import './styles/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for offline caching and installation
if ('serviceWorker' in navigator && typeof window !== 'undefined') {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Automatic silent update
    },
    onOfflineReady() {
      console.log('Ezpath is ready to work offline.');
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>
);
