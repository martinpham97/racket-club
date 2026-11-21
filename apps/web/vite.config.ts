import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // API_PORT comes from the shell or the repo-root .env, matching apps/api/src/local.ts.
  const apiPort = loadEnv(mode, '../..', '').API_PORT ?? '8787';
  return {
    plugins: [
      react(),
      VitePWA({
        // Our own service worker (src/sw.ts) so we can handle push events.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        // Name, colours and icons are replaced at runtime from the coach's branding and theme
        // (served by the API); these are the fresh-install defaults.
        manifest: {
          name: 'Racket Club',
          short_name: 'Racket Club',
          display: 'standalone',
          start_url: '/',
          theme_color: '#1f5fbf',
          background_color: '#f7f8fa',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        devOptions: { enabled: true, type: 'module' },
      }),
    ],
    // Pre-bundle up front: otherwise Vite finds these during the first page load, re-bundles and
    // reloads the page, and a test (or a developer) on a cold cache sees a blank page.
    optimizeDeps: {
      include: [
        'react',
        'react/jsx-dev-runtime',
        'react-dom/client',
        'i18next',
        'i18next-icu',
        'react-i18next',
        'workbox-precaching',
      ],
    },
    server: {
      port: 5173,
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
  };
});
