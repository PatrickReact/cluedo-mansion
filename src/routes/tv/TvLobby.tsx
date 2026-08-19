import QRCode from 'react-qr-code'
import { Bot, Check, Users, Wifi, WifiOff, X } from 'lucide-react'
import { SUSPECTS } from '@/engine/constants'
import type { SuspectId } from '@/engine/constants'
import { MIN_PLAYERS, MAX_PLAYERS } from '@/engine/reducer'
import type { BotLevel } from '@/engine/types'
import type { PublicState } from '@/engine/redact'
import type { Action } from '@/engine/actions'
import { joinUrl } from '@/lib/joinUrl'
import { newPlayerId } from '@/lib/roomCode'
import { cn } from '@/lib/cn'

interface TvLobbyProps {
  readonly state: PublicState
  readonly connected: boolean
  readonly transportKind: 'local' | 'supabase' | null
  readonly onStart: () => void
  readonly onAction: (action: Action) => void
}

const LEVELS: readonly BotLevel[] = ['facile', 'medio', 'difficile']

const LEVEL_STYLE: Record<BotLevel, string> = {
  facile: 'bg-green/20 text-green border-green/40',
  medio: 'bg-mustard/20 text-mustard border-mustard/40',
  difficile: 'bg-blood/25 text-blood-bright border-blood/50',
}

/**
 * Lobby sulla TV.
 *
 * Due compiti: far entrare le persone, e completare il tavolo con avversari
 * automatici quando le persone non bastano. Il minimo resta tre giocatori
 * — quello e il regolamento — ma un posto puo essere occupato da un bot, cosi
 * si gioca anche in due o da soli.
 */
export function TvLobby({ state, connected, transportKind, onStart, onAction }: TvLobbyProps) {
  const url = joinUrl(state.roomCode)
  const players = state.players
  const humans = players.filter((p) => p.bot === null)
  const canStart = players.length >= MIN_PLAYERS && humans.length >= 1

  const addBot = (suspect: SuspectId): void => {
    onAction({ type: 'ADD_BOT', playerId: `bot_${newPlayerId()}`, suspect, level: 'medio' })
  }

  const cycleLevel = (playerId: string, current: BotLevel): void => {
    const next = LEVELS[(LEVELS.indexOf(current) + 1) % LEVELS.length] as BotLevel
    onAction({ type: 'SET_BOT_LEVEL', playerId, level: next })
  }

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

        {players.length < MIN_PLAYERS && (
          <p className="text-paper-dim max-w-xl text-lg">
            Servono <strong className="text-paper">{MIN_PLAYERS} giocatori</strong> come nel gioco da tavolo.
            Se siete in meno, riempi i posti liberi con un avversario automatico: gioca con le stesse
            informazioni di una persona, né più né meno.
          </p>
        )}
      </section>

      {/* --- colonna destra: chi è al tavolo --- */}
      <aside className="deco-panel flex w-[30rem] flex-col gap-5 p-8">
        <h2 className="flex items-center gap-3 text-3xl">
          <Users className="text-gold size-7" strokeWidth={1.5} />
          Sospetti
          <span className="text-paper-dim ml-auto text-xl tabular-nums">
            {players.length}/{MAX_PLAYERS}
          </span>
        </h2>
        <div className="deco-divider" />

        <ul className="flex flex-1 flex-col gap-2.5">
          {SUSPECTS.map((s) => {
            const seat = players.find((p) => p.suspect === s.id)
            const level = seat?.bot ?? null

            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition',
                  seat ? 'border-gold/50 bg-ink-4/60' : 'border-paper/10 opacity-60',
                )}
              >
                <img
                  src={`/assets/tokens/${s.id}.svg`}
                  alt=""
                  className="size-11 shrink-0"
                  style={{ filter: seat ? 'none' : 'grayscale(1)' }}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg">{seat ? seat.name : s.name}</p>
                  <p className="text-paper-dim truncate text-sm">
                    {seat ? (level ? 'avversario automatico' : s.name) : 'posto libero'}
                  </p>
                </div>

                {/* Posto libero: si puo riempire con un bot. */}
                {!seat && (
                  <button
                    type="button"
                    onClick={() => addBot(s.id)}
                    className="btn btn-ghost !min-h-9 shrink-0 !px-3 !py-1 text-sm"
                  >
                    <Bot className="size-4" /> Bot
                  </button>
                )}

                {/* Bot: livello ciclabile e rimozione. */}
                {seat && level && (
                  <>
                    <button
                      type="button"
                      onClick={() => cycleLevel(seat.id, level)}
                      className={cn(
                        'shrink-0 rounded-lg border px-3 py-1.5 text-sm capitalize transition',
                        LEVEL_STYLE[level],
                      )}
                      title="Cambia livello"
                    >
                      {level}
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction({ type: 'REMOVE_BOT', playerId: seat.id })}
                      className="text-paper-dim hover:text-blood-bright shrink-0 p-1.5 transition"
                      title="Togli il bot"
                    >
                      <X className="size-5" />
                    </button>
                  </>
                )}

                {seat && !level && <Check className="text-green size-6 shrink-0" strokeWidth={2.5} />}
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
          {canStart
            ? 'Comincia il caso'
            : humans.length === 0
              ? 'Serve almeno una persona'
              : `Servono ${MIN_PLAYERS} giocatori`}
        </button>
      </aside>
    </div>
  )
}
