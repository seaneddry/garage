import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo-name>/. Change this if you rename the repo,
// or set VITE_BASE in the build environment.
const base = process.env.VITE_BASE ?? '/garage/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png'],
      manifest: {
        name: 'Garage',
        short_name: 'Garage',
        description: 'Service history, fuel and running costs for your cars.',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Never cache API calls: the data must always be live.
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // Adds the push and notification-tap handlers to the generated service worker.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
});
