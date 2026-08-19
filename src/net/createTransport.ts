import { LocalTransport } from './localTransport'
import { SupabaseTransport } from './supabaseTransport'
import type { Transport, TransportOptions } from './transport'

/** true se le variabili d'ambiente Supabase sono configurate. */
export const hasSupabase = (): boolean =>
  Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

/**
 * Sceglie il trasporto in base all'ambiente.
 *
 * Senza credenziali si ripiega su BroadcastChannel: il gioco resta giocabile
 * appena clonato, su un solo browser. Con le credenziali si passa a Supabase e
 * i telefoni possono connettersi davvero.
 */
export function createTransport(options: TransportOptions): Transport {
  return hasSupabase() ? new SupabaseTransport(options) : new LocalTransport(options)
}

export * from './transport'
