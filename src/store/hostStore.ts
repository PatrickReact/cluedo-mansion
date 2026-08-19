import { create } from 'zustand'
import type { Action } from '@/engine/actions'
import { parseAction } from '@/engine/actions'
import { reduce } from '@/engine/reducer'
import { toPrivateState, toPublicState } from '@/engine/redact'
import { createGame } from '@/engine/setup'
import { randomSeed } from '@/engine/rng'
import type { GameState } from '@/engine/types'
import { createTransport, type ConnectionStatus, type Transport } from '@/net/createTransport'
import { newRoomCode } from '@/lib/roomCode'

/**
 * LO STORE DELLA TV — l'host autoritativo.
 *
 * Qui vive l'unica copia vera dello stato. I telefoni non hanno voce in
 * capitolo: mandano intenti, questo store li fa passare dal reducer e
 * ritrasmette il risultato. Se un intento e illegale lo stato non si muove e
 * al mittente torna il motivo del rifiuto.
 *
 * Lo stato completo viene salvato in localStorage a ogni mossa: se qualcuno
 * ricarica la TV o la smart TV va in standby, la partita riparte da dove era.
 */

const STORAGE_KEY = 'cluedo:host:v1'

interface HostState {
  game: GameState | null
  transport: Transport | null
  status: ConnectionStatus
  /** Nome del canale in uso, mostrato nella diagnostica. */
  transportKind: 'local' | 'supabase' | null
  lastError: string | null

  /** Crea una partita nuova con un codice stanza nuovo. */
  newGame: () => Promise<void>
  /** Riprende la partita salvata, se esiste e ha meno di 12 ore. */
  restore: () => Promise<boolean>
  /** Applica un intento (dal telefono o dalla TV stessa). */
  dispatch: (action: Action) => void
  /** Riparte da zero mantenendo il codice stanza e i giocatori collegati. */
  resetGame: () => void
  shutdown: () => Promise<void>
}

interface Persisted {
  readonly savedAt: number
  readonly game: GameState
}

const MAX_AGE = 12 * 60 * 60 * 1000

function save(game: GameState): void {
  try {
    const payload: Persisted = { savedAt: Date.now(), game }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota piena o storage disabilitato: la partita continua in memoria.
  }
}

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    if (!parsed?.game || Date.now() - parsed.savedAt > MAX_AGE) return null
    return parsed.game
  } catch {
    return null
  }
}

export const useHostStore = create<HostState>((set, get) => {
  /** Ritrasmette lo stato pubblico e una vista privata per ogni giocatore. */
  const publish = (game: GameState, only?: string): void => {
    const { transport } = get()
    if (!transport) return
    transport.publishState(toPublicState(game))
    const targets = only ? game.players.filter((p) => p.id === only) : game.players
    for (const p of targets) {
      if (p.isNpc) continue
      transport.publishPrivate(p.id, toPrivateState(game, p.id))
    }
  }

  const attach = async (game: GameState): Promise<void> => {
    await get().transport?.disconnect()

    const transport = createTransport({
      roomCode: game.roomCode,
      role: 'host',
      events: {
        onIntent: (raw) => {
          const action = parseAction(raw)
          if (action) get().dispatch(action)
        },
        onSync: (playerId) => {
          const current = get().game
          if (current) publish(current, playerId)
        },
        onStatus: (status) => set({ status }),
      },
    })

    set({ game, transport, transportKind: transport.kind, lastError: null })
    await transport.connect()
    publish(game)
  }

  return {
    game: null,
    transport: null,
    status: 'idle',
    transportKind: null,
    lastError: null,

    async newGame() {
      const game = createGame({ roomCode: newRoomCode(), seed: randomSeed() })
      save(game)
      await attach(game)
    },

    async restore() {
      const game = load()
      if (!game) return false
      await attach(game)
      return true
    },

    dispatch(action) {
      const { game, transport } = get()
      if (!game) return

      const { state, error } = reduce(game, action, Date.now())

      if (error) {
        // L'errore torna solo a chi ha sbagliato: sulla TV non compare nulla.
        const playerId = 'playerId' in action ? action.playerId : null
        if (playerId && transport) transport.publishError(playerId, error)
        set({ lastError: error })
        return
      }

      set({ game: state, lastError: null })
      save(state)
      publish(state)
    },

    resetGame() {
      const { game } = get()
      if (!game) return
      const fresh = createGame({ roomCode: game.roomCode, seed: randomSeed(), config: game.config })
      set({ game: fresh })
      save(fresh)
      publish(fresh)
    },

    async shutdown() {
      await get().transport?.disconnect()
      set({ transport: null, status: 'idle' })
    },
  }
})

/** Cancella la partita salvata: usato dal pulsante "nuova partita". */
export const clearSavedGame = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // niente da fare
  }
}
