import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { port: 4830 },
  build: {
    sourcemap: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'], sentry: ['@sentry/browser'] } } }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'bofas483: The Lumen Audit',
        short_name: 'bofas483',
        description: 'A living digital-colony simulation about care, progress, and accountability.',
        theme_color: '#071410',
        background_color: '#050b09',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,avif,webp,png}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html'
      }
    })
  ]
});
