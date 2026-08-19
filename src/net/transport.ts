import type { Action } from '@/engine/actions'
import type { PrivateState, PublicState } from '@/engine/redact'

/**
 * L'astrazione di trasporto.
 *
 * Il gioco non sa nulla di Supabase, WebSocket o BroadcastChannel: conosce
 * solo questa interfaccia. Ne esistono due implementazioni:
 *
 *  - `LocalTransport`  BroadcastChannel, stesso browser. Zero configurazione,
 *                      serve per lo sviluppo e per giocare su un solo PC con
 *                      piu schede aperte.
 *  - `SupabaseTransport` Supabase Realtime, dispositivi diversi. E quella che
 *                      si usa in produzione con la TV e i telefoni.
 *
 * Aggiungerne una terza (PartyKit, Ably, un server proprio) significa
 * implementare questa interfaccia e nient'altro.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface TransportEvents {
  /** Solo lato host: e arrivato un intento da un telefono. */
  onIntent?: (action: Action) => void
  /** Solo lato host: un telefono chiede una ritrasmissione. */
  onSync?: (playerId: string | undefined) => void
  /** Solo lato client: nuovo stato pubblico. */
  onPublicState?: (state: PublicState) => void
  /** Solo lato client: nuova vista privata. */
  onPrivateState?: (state: PrivateState) => void
  /** Solo lato client: la mossa e stata rifiutata dall'host. */
  onError?: (message: string) => void
  onStatus?: (status: ConnectionStatus) => void
}

export interface Transport {
  readonly kind: 'local' | 'supabase'
  readonly roomCode: string

  connect(): Promise<void>
  disconnect(): Promise<void>
  readonly status: ConnectionStatus

  // --- host ---
  /** Trasmette lo stato pubblico a tutti. Non contiene mai carte o soluzione. */
  publishState(state: PublicState): void
  /** Invia la vista privata sul canale dedicato a quel giocatore. */
  publishPrivate(playerId: string, state: PrivateState): void
  /** Comunica a un singolo giocatore che la sua mossa e stata respinta. */
  publishError(playerId: string, message: string): void

  // --- client ---
  sendIntent(action: Action): void
  requestSync(playerId?: string): void
  /** Il client dichiara la propria identita: apre il canale privato. */
  identify(playerId: string): Promise<void>
}

export interface TransportOptions {
  readonly roomCode: string
  readonly role: 'host' | 'client'
  readonly events: TransportEvents
}
