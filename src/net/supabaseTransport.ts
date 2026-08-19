import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { Action } from '@/engine/actions'
import type { PrivateState, PublicState } from '@/engine/redact'
import { privateChannelName, publicChannelName } from '@/lib/crypto'
import { EVENT, PROTOCOL_VERSION, parseClientMessage } from './protocol'
import type { ConnectionStatus, Transport, TransportOptions } from './transport'

/**
 * Trasporto su Supabase Realtime.
 *
 * Struttura dei canali:
 *
 *   cl-pub-<hash(codice)>          tutti: stato pubblico + intenti in arrivo
 *   cl-prv-<hash(codice,player)>   un solo telefono: la sua mano, i suoi errori
 *
 * Il canale pubblico e visibile a chiunque ne indovini il nome, per questo NON
 * ci passa mai una carta: `toPublicState` toglie mani e soluzione prima della
 * trasmissione. Le informazioni riservate viaggiano solo sui canali privati,
 * il cui nome deriva dal codice stanza — che sta unicamente sulla TV.
 *
 * Serve solo il piano gratuito: nessuna tabella, nessuna riga scritta, solo
 * messaggi broadcast effimeri.
 */
export class SupabaseTransport implements Transport {
  readonly kind = 'supabase' as const
  readonly roomCode: string

  private client: SupabaseClient | null = null
  private publicChannel: RealtimeChannel | null = null
  private privateChannel: RealtimeChannel | null = null
  /** Solo lato host: un canale in uscita per ogni giocatore. */
  private readonly playerChannels = new Map<string, RealtimeChannel>()
  private readonly options: TransportOptions
  private playerId: string | null = null
  private seq = 0
  private _status: ConnectionStatus = 'idle'

  constructor(options: TransportOptions) {
    this.options = options
    this.roomCode = options.roomCode.toUpperCase()
  }

  get status(): ConnectionStatus {
    return this._status
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status
    this.options.events.onStatus?.(status)
  }

  private ensureClient(): SupabaseClient {
    if (this.client) return this.client
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Credenziali Supabase mancanti.')
    this.client = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return this.client
  }

  async connect(): Promise<void> {
    if (this.publicChannel) return
    this.setStatus('connecting')

    const client = this.ensureClient()
    const name = await publicChannelName(this.roomCode)
    const channel = client.channel(name, {
      config: { broadcast: { self: false, ack: false } },
    })

    const { events, role } = this.options

    if (role === 'host') {
      channel.on('broadcast', { event: EVENT.client }, ({ payload }) => {
        const msg = parseClientMessage(payload)
        if (!msg) return
        if (msg.t === 'intent') events.onIntent?.(msg.action)
        else if (msg.t === 'sync') events.onSync?.(msg.playerId)
      })
    } else {
      channel.on('broadcast', { event: EVENT.state }, ({ payload }) => {
        const data = payload as { seq?: number; state?: PublicState }
        if (data?.state) events.onPublicState?.(data.state)
      })
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout di connessione al canale.')), 15000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          this.setStatus('connected')
          resolve()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer)
          this.setStatus('error')
          reject(new Error('Connessione al canale non riuscita.'))
        } else if (status === 'CLOSED') {
          this.setStatus('reconnecting')
        }
      })
    })

    this.publicChannel = channel
    if (role === 'client') this.requestSync(this.playerId ?? undefined)
  }

  async disconnect(): Promise<void> {
    const client = this.client
    if (client) {
      if (this.publicChannel) await client.removeChannel(this.publicChannel)
      if (this.privateChannel) await client.removeChannel(this.privateChannel)
      for (const ch of this.playerChannels.values()) await client.removeChannel(ch)
    }
    this.publicChannel = null
    this.privateChannel = null
    this.playerChannels.clear()
    this.setStatus('idle')
  }

  /** Il telefono apre il proprio canale privato e ci resta in ascolto. */
  async identify(playerId: string): Promise<void> {
    this.playerId = playerId
    if (this.options.role !== 'client') return
    if (this.privateChannel) return

    const client = this.ensureClient()
    const name = await privateChannelName(this.roomCode, playerId)
    const channel = client.channel(name, { config: { broadcast: { self: false } } })
    const { events } = this.options

    channel.on('broadcast', { event: EVENT.private }, ({ payload }) => {
      const data = payload as { state?: PrivateState }
      if (data?.state) events.onPrivateState?.(data.state)
    })
    channel.on('broadcast', { event: EVENT.error }, ({ payload }) => {
      const data = payload as { message?: string }
      if (data?.message) events.onError?.(data.message)
    })

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
      })
    })
    this.privateChannel = channel
    this.requestSync(playerId)
  }

  /** Canale in uscita verso un giocatore, creato alla prima necessita. */
  private async channelFor(playerId: string): Promise<RealtimeChannel> {
    const existing = this.playerChannels.get(playerId)
    if (existing) return existing

    const client = this.ensureClient()
    const name = await privateChannelName(this.roomCode, playerId)
    const channel = client.channel(name, { config: { broadcast: { self: false } } })
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
      })
    })
    this.playerChannels.set(playerId, channel)
    return channel
  }

  publishState(state: PublicState): void {
    this.seq += 1
    void this.publicChannel?.send({
      type: 'broadcast',
      event: EVENT.state,
      payload: { t: 'state', v: PROTOCOL_VERSION, seq: this.seq, state },
    })
  }

  publishPrivate(playerId: string, state: PrivateState): void {
    this.seq += 1
    const seq = this.seq
    void this.channelFor(playerId).then((ch) =>
      ch.send({
        type: 'broadcast',
        event: EVENT.private,
        payload: { t: 'private', v: PROTOCOL_VERSION, seq, state },
      }),
    )
  }

  publishError(playerId: string, message: string): void {
    void this.channelFor(playerId).then((ch) =>
      ch.send({
        type: 'broadcast',
        event: EVENT.error,
        payload: { t: 'error', v: PROTOCOL_VERSION, message },
      }),
    )
  }

  sendIntent(action: Action): void {
    void this.publicChannel?.send({
      type: 'broadcast',
      event: EVENT.client,
      payload: { t: 'intent', v: PROTOCOL_VERSION, action },
    })
  }

  requestSync(playerId?: string): void {
    void this.publicChannel?.send({
      type: 'broadcast',
      event: EVENT.client,
      payload: { t: 'sync', v: PROTOCOL_VERSION, playerId },
    })
  }
}
