/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** URL pubblico usato per generare il QR di ingresso (opzionale). */
  readonly VITE_PUBLIC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
