import { z } from 'zod'
import { ActionSchema } from '@/engine/actions'

/**
 * Il protocollo fra telefoni e TV.
 *
 * Un solo principio: i telefoni mandano INTENTI, mai stato. L'host e l'unica
 * autorita, ricalcola tutto con il reducer e ritrasmette il risultato. Nessun
 * messaggio in arrivo viene creduto sulla parola.
 */

export const PROTOCOL_VERSION = 1

/** Messaggi telefono -> host, sul canale pubblico. */
export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('intent'), v: z.number(), action: ActionSchema }),
  /** Richiesta di ritrasmissione: usata dopo una riconnessione. */
  z.object({ t: z.literal('sync'), v: z.number(), playerId: z.string().optional() }),
  /** Battito per la presenza. */
  z.object({ t: z.literal('ping'), v: z.number(), playerId: z.string() }),
])

export type ClientMessage = z.infer<typeof ClientMessageSchema>

/** Eventi realtime: nomi corti, viaggiano a ogni mossa. */
export const EVENT = {
  /** Host -> tutti: stato pubblico completo. */
  state: 's',
  /** Host -> singolo giocatore: la sua vista privata. */
  private: 'p',
  /** Host -> singolo giocatore: mossa rifiutata. */
  error: 'e',
  /** Telefono -> host. */
  client: 'c',
} as const

export interface StateMessage {
  readonly t: 'state'
  readonly v: number
  /** Contatore monotono: scarta i pacchetti arrivati fuori ordine. */
  readonly seq: number
  readonly state: unknown
}

export interface PrivateMessage {
  readonly t: 'private'
  readonly v: number
  readonly seq: number
  readonly state: unknown
}

export interface ErrorMessage {
  readonly t: 'error'
  readonly v: number
  readonly message: string
}

export const parseClientMessage = (raw: unknown): ClientMessage | null => {
  const res = ClientMessageSchema.safeParse(raw)
  if (!res.success) return null
  if (res.data.v !== PROTOCOL_VERSION) return null
  return res.data
}
