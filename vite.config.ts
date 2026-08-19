import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'assets/**/*.svg'],
      manifest: {
        name: 'Cluedo — Delitto a Tudor Mansion',
        short_name: 'Cluedo',
        description: 'Cluedo multiplayer: la TV mostra la mappa, i telefoni sono i controller.',
        theme_color: '#0b0a12',
        background_color: '#0b0a12',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/assets/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/assets/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/assets/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Il gioco è realtime: mai servire l'HTML da cache stantia.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Necessario per testare dal telefono sulla LAN durante lo sviluppo.
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    // Niente manualChunks: separare a mano React dalle librerie che lo usano
    // (motion, react-router) produce due istanze di React e un dispatcher
    // nullo a runtime. Il chunking automatico di Rolldown e gia corretto.
  },
})
