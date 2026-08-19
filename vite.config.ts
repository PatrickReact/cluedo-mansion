import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv, type Plugin } from 'vite'

/**
 * GUARDIANO DELLE CHIAVI SEGRETE
 *
 * Vite sostituisce ogni `import.meta.env.VITE_*` con il suo valore letterale:
 * tutto cio che ha quel prefisso finisce nel JavaScript servito a chiunque apra
 * il sito. Una chiave `sb_secret_…` o `service_role` li dentro scavalca le
 * policy RLS e apre il database al mondo.
 *
 * Questo plugin ferma la build invece di avvisare dopo. E successo davvero,
 * durante lo sviluppo di questo gioco: un helper che restituiva
 * `import.meta.env` come oggetto intero ha inlineato TUTTE le variabili,
 * compresa una segreta. Un avviso non l'avrebbe impedito; questo si.
 */
function bloccaChiaviSegrete(): Plugin {
  const sospette = [/^sb_secret_/, /^service_role/]

  return {
    name: 'cluedo:blocca-chiavi-segrete',
    enforce: 'pre',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const colpevoli = Object.entries(env).filter(([, value]) =>
        sospette.some((re) => re.test(String(value).trim())),
      )
      if (colpevoli.length === 0) return

      const nomi = colpevoli.map(([name]) => name).join(', ')
      throw new Error(
        `

  CHIAVE SEGRETA ESPOSTA — build interrotta.

` +
          `  Queste variabili contengono una chiave segreta e hanno il prefisso VITE_,
` +
          `  quindi finirebbero nel bundle servito a tutti i browser:

` +
          `      ${nomi}

` +
          `  Cosa fare:
` +
          `    1. toglile dal .env e dalle variabili d'ambiente su Vercel;
` +
          `    2. rigenerale dal pannello Supabase: vanno considerate compromesse;
` +
          `    3. per il client serve solo VITE_SUPABASE_PUBLISHABLE_KEY.

` +
          `  Il gioco non usa mai una chiave segreta: parla solo con i canali
` +
          `  broadcast, che la chiave pubblicabile copre per intero.
`,
      )
    },
  }
}

export default defineConfig({
  plugins: [
    bloccaChiaviSegrete(),
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
