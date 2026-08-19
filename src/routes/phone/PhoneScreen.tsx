import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, Gamepad2, Layers, WifiOff, X } from 'lucide-react'
import { SUSPECT_BY_ID } from '@/engine/constants'
import type { SuspectId } from '@/engine/constants'
import { cardLabel, parseCard } from '@/engine/cards'
import type { CardKey } from '@/engine/types'
import { usePlayerStore, savedName } from '@/store/playerStore'
import { useWakeLock } from '@/hooks/useWakeLock'
import { roomCodeFromHash } from '@/lib/joinUrl'
import { cn } from '@/lib/cn'
import { PhoneJoin } from './PhoneJoin'
import { ActionPanel } from './ActionPanel'
import { Notebook } from './Notebook'

type Tab = 'action' | 'notes' | 'hand'

/**
 * IL TELEFONO — il controller personale di un giocatore.
 *
 * Tre schede e basta: cosa posso fare, cosa ho dedotto, cosa ho in mano.
 * Tutto ciò che è privato vive solo qui: la mano e le carte viste non
 * compaiono mai sulla TV, nemmeno di sfuggita.
 */
export function PhoneScreen() {
  const store = usePlayerStore()
  const [tab, setTab] = useState<Tab>('action')

  useWakeLock(true)

  const me = store.publicState?.players.find((p) => p.id === store.playerId)
  const joined = Boolean(me)

  // Il codice arriva dal QR (fragment) oppure viene digitato a mano.
  const initialCode = useMemo(() => roomCodeFromHash(), [])

  const handlePeek = useCallback(
    (code: string) => {
      void store.connect(code)
    },
    // `connect` è stabile nello store zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handleJoin = useCallback(
    (code: string, name: string, suspect: SuspectId) => {
      void store.join(code, name, suspect)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Quando è il mio momento di agire, la scheda azioni si apre da sola.
  const phaseKind = store.publicState?.phase.kind
  const mustDisprove =
    store.publicState?.phase.kind === 'resolving_suggestion' &&
    store.publicState.phase.awaitingFrom === store.playerId
  useEffect(() => {
    if (mustDisprove) setTab('action')
  }, [mustDisprove])
  useEffect(() => {
    if (phaseKind === 'suggestion_result') setTab('action')
  }, [phaseKind])

  if (!joined) {
    return (
      <PhoneJoin
        initialCode={initialCode}
        initialName={savedName()}
        publicState={store.publicState}
        connecting={store.status === 'connecting'}
        error={store.error}
        onPeek={handlePeek}
        onJoin={handleJoin}
      />
    )
  }

  const pub = store.publicState
  if (!pub || !me) return null

  const suspect = SUSPECT_BY_ID[me.suspect]

  return (
    <div className="bg-ink flex min-h-dvh flex-col">
      {/* --- intestazione: chi sono --- */}
      <header
        className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
        style={{ background: `linear-gradient(180deg, ${suspect.colorDark}55, transparent)` }}
      >
        <img src={`/assets/tokens/${me.suspect}.svg`} alt="" className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-lg leading-tight">{me.name}</p>
          <p className="text-paper-dim truncate text-xs">{suspect.name}</p>
        </div>
        {store.status !== 'connected' && (
          <span className="bg-blood/25 text-blood-bright flex items-center gap-1.5 rounded-full px-3 py-1 text-xs">
            <WifiOff className="size-3.5" /> offline
          </span>
        )}
        <span className="bg-ink-3 text-paper-dim rounded-full px-3 py-1 text-xs tracking-[0.2em]">
          {pub.roomCode}
        </span>
      </header>

      {/* --- avviso di mossa rifiutata --- */}
      <AnimatePresence>
        {store.error && (
          <motion.button
            type="button"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onClick={() => store.clearError()}
            className="border-blood/50 bg-blood/15 text-blood-bright mx-4 mb-2 flex items-center gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm"
          >
            <span className="flex-1">{store.error}</span>
            <X className="size-4 shrink-0" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* --- contenuto --- */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === 'action' && (
          <ActionPanel pub={pub} priv={store.privateState} playerId={store.playerId} send={store.send} />
        )}
        {tab === 'notes' && (
          <Notebook pub={pub} notes={store.notes()} playerId={store.playerId} onToggle={store.cycleMark} />
        )}
        {tab === 'hand' && <HandView cards={store.privateState?.hand ?? []} />}
      </main>

      {/* --- navigazione --- */}
      <nav className="border-paper/10 bg-ink-2 flex shrink-0 border-t pb-[env(safe-area-inset-bottom)]">
        {(
          [
            { id: 'action', label: 'Azione', icon: Gamepad2, badge: mustDisprove },
            { id: 'notes', label: 'Taccuino', icon: BookOpen, badge: false },
            { id: 'hand', label: 'Carte', icon: Layers, badge: false },
          ] as const
        ).map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-1 py-3 text-xs transition',
              tab === id ? 'text-gold' : 'text-paper-dim',
            )}
          >
            <Icon className="size-5" strokeWidth={tab === id ? 2.3 : 1.8} />
            {label}
            {badge && <span className="bg-blood-bright absolute top-2 right-1/4 size-2 rounded-full" />}
          </button>
        ))}
      </nav>
    </div>
  )
}

/** La mano del giocatore: le uniche carte che conosce con certezza. */
function HandView({ cards }: { readonly cards: readonly CardKey[] }) {
  if (cards.length === 0) {
    return <p className="text-paper-dim p-8 text-center">Le carte arrivano quando la partita comincia.</p>
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-paper-dim text-sm">
        Nessuna di queste è nella busta. Mostrale una alla volta, solo a chi ti interroga.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((key) => {
          const card = parseCard(key)
          const folder = card.type === 'suspect' ? 'suspects' : card.type === 'weapon' ? 'weapons' : 'rooms'
          return (
            <figure key={key} className="deco-panel flex flex-col items-center gap-3 p-4">
              <img
                src={`/assets/${folder}/${card.id}.svg`}
                alt=""
                className={card.type === 'suspect' ? 'h-28' : 'h-20'}
              />
              <figcaption className="text-paper text-center text-sm leading-tight">
                {cardLabel(key)}
                <span className="text-paper-dim mt-0.5 block text-[0.7rem] tracking-wider uppercase">
                  {card.type === 'suspect' ? 'sospetto' : card.type === 'weapon' ? 'arma' : 'stanza'}
                </span>
              </figcaption>
            </figure>
          )
        })}
      </div>
      <p className="text-paper-dim mt-2 text-center text-xs">{cards.length} carte in mano</p>
    </div>
  )
}
