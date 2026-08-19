/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  /** Nomenclatura corrente Supabase. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Nomenclatura storica, ancora valida. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  // Le chiavi segrete non sono dichiarate di proposito: se non hanno un tipo,
  // leggerle per sbaglio non compila. Il controllo vero e in vite.config.ts.
  /** URL pubblico usato per generare il QR di ingresso (opzionale). */
  readonly VITE_PUBLIC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
