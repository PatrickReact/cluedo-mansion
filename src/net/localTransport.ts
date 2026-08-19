import type { Action } from '@/engine/actions'
import type { PrivateState, PublicState } from '@/engine/redact'
import { PROTOCOL_VERSION, parseClientMessage } from './protocol'
import type { ConnectionStatus, Transport, TransportOptions } from './transport'

/**
 * Trasporto locale su BroadcastChannel.
 *
 * Funziona solo fra schede dello stesso browser, ma senza alcuna
 * configurazione: si apre /tv in una scheda e /play in altre due e si gioca.
 * E il ripiego automatico quando mancano le credenziali Supabase, cosi il
 * progetto e giocabile appena clonato.
 */
export class LocalTransport implements Transport {
  readonly kind = 'local' as const
  readonly roomCode: string

  private channel: BroadcastChannel | null = null
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

  async connect(): Promise<void> {
    if (this.channel) return
    this.setStatus('connecting')
    this.channel = new BroadcastChannel(`cluedo-local-${this.roomCode}`)
    this.channel.onmessage = (ev: MessageEvent) => this.handle(ev.data)
    this.setStatus('connected')
    if (this.options.role === 'client') this.requestSync(this.playerId ?? undefined)
  }

  async disconnect(): Promise<void> {
    this.channel?.close()
    this.channel = null
    this.setStatus('idle')
  }

  async identify(playerId: string): Promise<void> {
    this.playerId = playerId
  }

  private post(payload: unknown): void {
    this.channel?.postMessage(payload)
  }

  private handle(data: unknown): void {
    if (typeof data !== 'object' || data === null) return
    const msg = data as { t?: string; to?: string }
    const { events, role } = this.options

    if (role === 'host') {
      const parsed = parseClientMessage(data)
      if (!parsed) return
      if (parsed.t === 'intent') events.onIntent?.(parsed.action)
      else if (parsed.t === 'sync') events.onSync?.(parsed.playerId)
      return
    }

    // Lato client.
    switch (msg.t) {
      case 'state':
        events.onPublicState?.((data as { state: PublicState }).state)
        break
      case 'private':
        if (msg.to && msg.to !== this.playerId) return
        events.onPrivateState?.((data as { state: PrivateState }).state)
        break
      case 'error':
        if (msg.to && msg.to !== this.playerId) return
        events.onError?.((data as { message: string }).message)
        break
      default:
        break
    }
  }

  publishState(state: PublicState): void {
    this.seq += 1
    this.post({ t: 'state', v: PROTOCOL_VERSION, seq: this.seq, state })
  }

  publishPrivate(playerId: string, state: PrivateState): void {
    this.seq += 1
    this.post({ t: 'private', v: PROTOCOL_VERSION, seq: this.seq, to: playerId, state })
  }

  publishError(playerId: string, message: string): void {
    this.post({ t: 'error', v: PROTOCOL_VERSION, to: playerId, message })
  }

  sendIntent(action: Action): void {
    this.post({ t: 'intent', v: PROTOCOL_VERSION, action })
  }

  requestSync(playerId?: string): void {
    this.post({ t: 'sync', v: PROTOCOL_VERSION, playerId })
  }
}
