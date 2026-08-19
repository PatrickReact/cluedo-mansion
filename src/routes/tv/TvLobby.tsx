import QRCode from 'react-qr-code'
import { Check, Users, Wifi, WifiOff } from 'lucide-react'
import { SUSPECTS } from '@/engine/constants'
import { MIN_PLAYERS, MAX_PLAYERS } from '@/engine/reducer'
import type { PublicState } from '@/engine/redact'
import { joinUrl } from '@/lib/joinUrl'
import { cn } from '@/lib/cn'

interface TvLobbyProps {
  readonly state: PublicState
  readonly connected: boolean
  readonly transportKind: 'local' | 'supabase' | null
  readonly onStart: () => void
}

/**
 * Lobby sulla TV.
 *
 * Un solo compito, fatto bene: far entrare le persone. Il QR e enorme perche
 * va inquadrato dal divano, e il codice testuale sta sotto in caratteri
 * altrettanto grandi per chi preferisce digitarlo.
 */
export function TvLobby({ state, connected, transportKind, onStart }: TvLobbyProps) {
  const url = joinUrl(state.roomCode)
  const players = state.players.filter((p) => !p.isNpc)
  const canStart = players.length >= MIN_PLAYERS

  return (
    <div className="grid min-h-dvh grid-cols-[1fr_auto] gap-10 p-10">
      {/* --- colonna sinistra: invito --- */}
      <section className="flex flex-col justify-center gap-8">
        <img src="/assets/logo.svg" alt="Cluedo — Tudor Mansion" className="w-[28rem]" />

        <div>
          <p className="text-paper-dim text-2xl">Inquadra il codice con il telefono</p>
          <p className="text-paper-dim/70 mt-1 text-lg">
            oppure vai su {url.replace(/#.*/, '')} e digita il codice
          </p>
        </div>

        <div className="flex items-end gap-8">
          <div className="bg-paper rounded-2xl p-5">
            <QRCode value={url} size={260} bgColor="#f4efe4" fgColor="#0b0a12" level="M" />
          </div>
          <div>
            <p className="text-gold text-lg tracking-[0.3em] uppercase">Codice stanza</p>
            <p className="font-display text-paper text-8xl tracking-[0.15em] tabular-nums">
              {state.roomCode}
            </p>
            <p
              className={cn(
                'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm',
                connected ? 'bg-green/20 text-green' : 'bg-blood/25 text-blood-bright',
              )}
            >
              {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
              {connected ? 'Canale aperto' : 'Connessione in corso…'}
              {transportKind === 'local' && ' · solo questo browser'}
            </p>
          </div>
        </div>
      </section>

      {/* --- colonna destra: chi è entrato --- */}
      <aside className="deco-panel flex w-[26rem] flex-col gap-5 p-8">
        <h2 className="flex items-center gap-3 text-3xl">
          <Users className="text-gold size-7" strokeWidth={1.5} />
          Sospetti
          <span className="text-paper-dim ml-auto text-xl tabular-nums">
            {players.length}/{MAX_PLAYERS}
          </span>
        </h2>
        <div className="deco-divider" />

        <ul className="flex flex-1 flex-col gap-3">
          {SUSPECTS.map((s) => {
            const taken = players.find((p) => p.suspect === s.id)
            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-4 rounded-xl border p-3 transition',
                  taken ? 'border-gold/50 bg-ink-4/60' : 'border-paper/10 opacity-45',
                )}
              >
                <img
                  src={`/assets/tokens/${s.id}.svg`}
                  alt=""
                  className="size-12 shrink-0"
                  style={{ filter: taken ? 'none' : 'grayscale(1)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl">{taken ? taken.name : s.name}</p>
                  <p className="text-paper-dim truncate text-sm">{taken ? s.name : 'libero'}</p>
                </div>
                {taken && <Check className="text-green size-6 shrink-0" strokeWidth={2.5} />}
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="btn btn-primary w-full text-xl"
        >
          {canStart ? 'Comincia il caso' : `Servono almeno ${MIN_PLAYERS} giocatori`}
        </button>
      </aside>
    </div>
  )
}
