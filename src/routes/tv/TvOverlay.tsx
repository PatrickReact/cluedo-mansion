import { AnimatePresence, motion } from 'motion/react'
import { ROOM_BY_ID, SUSPECT_BY_ID, WEAPON_BY_ID } from '@/engine/constants'
import type { PublicState } from '@/engine/redact'
import type { Solution } from '@/engine/types'

interface TvOverlayProps {
  readonly state: PublicState
}

/**
 * I momenti da grande schermo.
 *
 * Un'ipotesi al tavolo vero è un evento: tutti si girano. Qui l'ipotesi occupa
 * la TV intera per qualche secondo, così chi sta guardando il telefono alza
 * la testa. Non compare mai una carta: quelle restano sui telefoni.
 */
export function TvOverlay({ state }: TvOverlayProps) {
  const phase = state.phase
  const nameOf = (id: string | null): string => state.players.find((p) => p.id === id)?.name ?? 'Qualcuno'

  return (
    <AnimatePresence>
      {(phase.kind === 'resolving_suggestion' || phase.kind === 'suggestion_result') && (
        <Backdrop key="sugg">
          <p className="text-gold text-2xl tracking-[0.4em] uppercase">Ipotesi</p>
          <p className="text-paper-dim mt-2 text-3xl">{nameOf(phase.suggesterId)} dichiara</p>
          <Triptych solution={phase.suggestion} />

          {phase.kind === 'resolving_suggestion' && phase.awaitingFrom && (
            <motion.p
              className="text-peacock mt-10 text-3xl"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              {nameOf(phase.awaitingFrom)} sta scegliendo quale carta mostrare…
            </motion.p>
          )}

          {phase.kind === 'suggestion_result' && (
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-10 text-3xl"
            >
              {phase.disprovedBy ? (
                <span className="text-peacock">
                  {nameOf(phase.disprovedBy)} confuta — la carta l&apos;ha vista solo{' '}
                  {nameOf(phase.suggesterId)}
                </span>
              ) : (
                <span className="text-blood-bright">Nessuno può confutare. Un silenzio pesante.</span>
              )}
            </motion.p>
          )}
        </Backdrop>
      )}

      {phase.kind === 'game_over' && (
        <Backdrop key="over">
          {phase.winnerId ? (
            <>
              <p className="text-gold text-2xl tracking-[0.4em] uppercase">Caso risolto</p>
              <p className="font-display text-paper mt-4 text-7xl">{nameOf(phase.winnerId)}</p>
            </>
          ) : (
            <p className="font-display text-blood-bright text-6xl">Il caso resta irrisolto</p>
          )}
          <p className="text-paper-dim mt-10 text-2xl">La busta conteneva</p>
          <Triptych solution={phase.solution} />
        </Backdrop>
      )}
    </AnimatePresence>
  )
}

function Backdrop({ children }: { readonly children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-ink/92 pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center p-12 text-center backdrop-blur-sm"
    >
      {children}
    </motion.div>
  )
}

/** Le tre carte dell'ipotesi, affiancate come un trittico. */
function Triptych({ solution }: { readonly solution: Solution }) {
  const items = [
    { kind: 'suspects', id: solution.suspect, label: SUSPECT_BY_ID[solution.suspect].name },
    { kind: 'rooms', id: solution.room, label: ROOM_BY_ID[solution.room].name },
    { kind: 'weapons', id: solution.weapon, label: WEAPON_BY_ID[solution.weapon].name },
  ] as const

  return (
    <div className="mt-8 flex items-stretch gap-6">
      {items.map((item, i) => (
        <motion.figure
          key={item.kind}
          initial={{ opacity: 0, y: 30, rotate: i === 0 ? -4 : i === 2 ? 4 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 * i, type: 'spring', stiffness: 180, damping: 20 }}
          className="deco-panel flex w-64 flex-col items-center gap-4 p-6"
        >
          <img
            src={`/assets/${item.kind}/${item.id}.svg`}
            alt=""
            className={item.kind === 'suspects' ? 'h-44' : 'h-32'}
          />
          <figcaption className="font-display text-paper text-2xl">{item.label}</figcaption>
        </motion.figure>
      ))}
    </div>
  )
}
