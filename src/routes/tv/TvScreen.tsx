import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, Home as HomeIcon } from 'lucide-react'
import { reachable } from '@/engine/board'
import type { Position } from '@/engine/board'
import { SUSPECT_BY_ID } from '@/engine/constants'
import { toPublicState } from '@/engine/redact'
import { coordKey } from '@/engine/board'
import type { SuspectId } from '@/engine/constants'
import { useHostStore, clearSavedGame } from '@/store/hostStore'
import { useWakeLock } from '@/hooks/useWakeLock'
import { Board } from '@/ui/Board'
import { TvLobby } from './TvLobby'
import { TvSidebar } from './TvSidebar'
import { TvOverlay } from './TvOverlay'

/**
 * LA TV — host autoritativo e schermo condiviso.
 *
 * Questa scheda possiede la partita: riceve gli intenti dai telefoni, li fa
 * passare dal reducer e ritrasmette lo stato. Va tenuta aperta per tutta la
 * durata: se si chiude, la partita si ferma (ma non si perde — è salvata in
 * locale e riprende ricaricando la pagina).
 */
export function TvScreen() {
  const { game, status, transportKind, newGame, restore, dispatch, resetGame } = useHostStore()
  const [booted, setBooted] = useState(false)

  useWakeLock(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const resumed = await restore()
      if (!resumed && !cancelled) await newGame()
      if (!cancelled) setBooted(true)
    })()
    return () => {
      cancelled = true
    }
    // Volutamente una sola volta: montare la TV apre o riprende la partita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const publicState = useMemo(() => (game ? toPublicState(game) : null), [game])

  // Le caselle raggiungibili si ricalcolano dallo stato: la TV le mostra a
  // tutti, così il tavolo vede le opzioni di chi sta decidendo.
  const options = useMemo(() => {
    if (!game || game.phase.kind !== 'moving') return null
    const suspect = game.turnOrder[game.turnIndex % game.turnOrder.length]
    if (!suspect) return null
    const from = game.positions[suspect] as Position
    const blocked = new Set(
      Object.entries(game.positions)
        .filter(([id, p]) => id !== suspect && p.kind === 'corridor')
        .map(([, p]) => (p.kind === 'corridor' ? coordKey(p.at) : '')),
    )
    return reachable(from, game.phase.dice[0] + game.phase.dice[1], {
      blocked,
      forbiddenRoom: game.leftRoomThisTurn,
    })
  }, [game])

  if (!booted || !game || !publicState) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="font-display text-gold animate-pulse text-3xl">Si prepara la magione…</p>
      </main>
    )
  }

  const connected = status === 'connected'

  if (publicState.phase.kind === 'lobby') {
    return (
      <div className="tv-root min-h-dvh">
        <TvLobby
          state={publicState}
          connected={connected}
          transportKind={transportKind}
          onStart={() => dispatch({ type: 'START_GAME' })}
        />
      </div>
    )
  }

  const currentSuspect: SuspectId | null =
    publicState.turnOrder[publicState.turnIndex % publicState.turnOrder.length] ?? null
  const currentPlayer = publicState.players.find((p) => p.suspect === currentSuspect && !p.isNpc)

  return (
    <div className="tv-root relative flex h-dvh gap-6 overflow-hidden p-6">
      {/* --- tabellone --- */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <header className="flex items-baseline gap-5">
          <h1 className="font-display text-gold text-3xl">Tudor Mansion</h1>
          {currentPlayer && (
            <p className="text-2xl">
              <span
                className="mr-2 inline-block size-3 rounded-full align-middle"
                style={{ background: SUSPECT_BY_ID[currentPlayer.suspect].color }}
              />
              Tocca a <strong>{currentPlayer.name}</strong>
            </p>
          )}
          <p className="text-paper-dim ml-auto text-lg">
            Stanza <strong className="text-paper tracking-[0.2em]">{publicState.roomCode}</strong>
          </p>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <Board
            variant="tv"
            className="max-h-full max-w-full"
            positions={publicState.positions}
            weapons={publicState.weapons}
            path={publicState.lastPath}
            activeSuspect={currentSuspect}
            reachableCorridors={new Set(options?.corridors.keys() ?? [])}
            reachableRooms={new Set(options?.rooms.keys() ?? [])}
          />
        </div>
      </main>

      <TvSidebar state={publicState} currentPlayerId={currentPlayer?.id ?? null} />

      <TvOverlay state={publicState} />

      {/* Controlli di servizio: minuscoli, la TV non è un telecomando. */}
      <div className="pointer-events-auto absolute bottom-2 left-3 flex gap-2 opacity-25 transition hover:opacity-100">
        <button
          type="button"
          className="btn btn-ghost !min-h-8 !px-3 !py-1 text-xs"
          onClick={() => {
            if (confirm('Ricominciare la partita da capo con gli stessi giocatori?')) resetGame()
          }}
        >
          <RotateCcw className="size-3.5" /> Nuova partita
        </button>
        <Link to="/" className="btn btn-ghost !min-h-8 !px-3 !py-1 text-xs" onClick={() => clearSavedGame()}>
          <HomeIcon className="size-3.5" /> Esci
        </Link>
      </div>
    </div>
  )
}
