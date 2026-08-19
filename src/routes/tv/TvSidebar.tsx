import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Skull, ScrollText } from 'lucide-react'
import { ROOM_BY_ID, SUSPECT_BY_ID } from '@/engine/constants'
import type { PublicState } from '@/engine/redact'
import { cn } from '@/lib/cn'
import { Die } from '@/ui/Die'

interface TvSidebarProps {
  readonly state: PublicState
  readonly currentPlayerId: string | null
}

const KIND_STYLE: Record<string, string> = {
  suggestion: 'text-gold',
  accusation: 'text-blood-bright font-semibold',
  disprove: 'text-peacock',
  passage: 'text-plum',
  move: 'text-paper-dim',
  system: 'text-paper-dim/70',
}

/** Colonna destra della TV: chi gioca, cosa è successo, cosa hanno tirato. */
export function TvSidebar({ state, currentPlayerId }: TvSidebarProps) {
  const logRef = useRef<HTMLUListElement>(null)
  const players = state.players.filter((p) => !p.isNpc)
  const dice = state.phase.kind === 'moving' ? state.phase.dice : null

  // La cronaca scorre da sola: nessuno può toccare la TV.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.log.length])

  return (
    <aside className="flex h-full w-[24rem] shrink-0 flex-col gap-4">
      {/* --- giocatori --- */}
      <section className="deco-panel p-5">
        <ul className="flex flex-col gap-2">
          {players.map((p) => {
            const s = SUSPECT_BY_ID[p.suspect]
            const isTurn = p.id === currentPlayerId
            return (
              <li
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 transition',
                  isTurn && 'bg-gold/15 ring-gold/60 ring-1',
                  p.eliminated && 'opacity-45',
                )}
              >
                <span
                  className="ring-ink size-4 shrink-0 rounded-full ring-2"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate text-lg">{p.name}</span>
                {p.eliminated && <Skull className="text-blood-bright size-4 shrink-0" />}
                <span className="text-paper-dim shrink-0 text-sm tabular-nums">{p.handCount}</span>
                {!p.connected && (
                  <span className="bg-blood size-2 shrink-0 rounded-full" title="disconnesso" />
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* --- dadi --- */}
      <AnimatePresence>
        {dice && (
          <motion.section
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="deco-panel flex items-center justify-center gap-5 p-5"
          >
            <Die value={dice[0]} size={64} />
            {dice[1] > 0 && <Die value={dice[1]} size={64} />}
            <div className="text-center">
              <p className="font-display text-gold text-5xl tabular-nums">{dice[0] + dice[1]}</p>
              <p className="text-paper-dim text-xs tracking-widest uppercase">passi</p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* --- cronaca --- */}
      <section className="deco-panel flex min-h-0 flex-1 flex-col p-5">
        <h3 className="mb-3 flex items-center gap-2 text-xl">
          <ScrollText className="text-gold size-5" strokeWidth={1.6} />
          Cronaca
        </h3>
        <div className="deco-divider mb-3" />
        <ul ref={logRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 text-base">
          <AnimatePresence initial={false}>
            {state.log.slice(-40).map((entry) => (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn('leading-snug', KIND_STYLE[entry.kind] ?? 'text-paper-dim')}
              >
                {entry.text}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      {/* --- armi, per orientarsi a colpo d'occhio --- */}
      <section className="deco-panel p-4">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {Object.entries(state.weapons).map(([weapon, room]) => (
            <li key={weapon} className="flex items-center gap-2 truncate">
              <img src={`/assets/weapons/${weapon}.svg`} alt="" className="size-4 shrink-0 opacity-70" />
              <span className="text-paper-dim truncate">{ROOM_BY_ID[room].name}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
