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
import { botDelay, botOnTheClock, nextBotTurn, type BotMemories } from '@/bots/driver'

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
  /**
   * Memoria privata di ciascun bot: le carte che ha visto e quelle che ha
   * mostrato. Non e stato di gioco — e informazione di un solo giocatore — per
   * questo vive qui e non dentro `GameState`, dove finirebbe per essere
   * trasmessa insieme al resto.
   */
  botMemories: BotMemories
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
  /** Senza questa, un refresh della TV azzererebbe cio che i bot sapevano. */
  readonly botMemories?: BotMemories
}

const MAX_AGE = 12 * 60 * 60 * 1000

function save(game: GameState, botMemories: BotMemories): void {
  try {
    const payload: Persisted = { savedAt: Date.now(), game, botMemories }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota piena o storage disabilitato: la partita continua in memoria.
  }
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    if (!parsed?.game || Date.now() - parsed.savedAt > MAX_AGE) return null
    return parsed
  } catch {
    return null
  }
}

export const useHostStore = create<HostState>((set, get) => {
  /**
   * Timer della prossima mossa automatica.
   *
   * I bot non giocano istantaneamente: una partita che scatta in un lampo
   * sulla TV e illeggibile per chi sta al divano. La pausa e proporzionata
   * all'azione — tirare i dadi e rapido, un'accusa merita qualche secondo.
   */
  let botTimer: ReturnType<typeof setTimeout> | null = null

  const cancelBot = (): void => {
    if (botTimer) clearTimeout(botTimer)
    botTimer = null
  }

  /** Se tocca a un bot, ne programma la mossa. */
  const scheduleBot = (): void => {
    cancelBot()
    const { game, botMemories } = get()
    if (!game || !botOnTheClock(game)) return

    const turn = nextBotTurn(game, botMemories)
    if (!turn) return

    if (import.meta.env.DEV) {
      // Il ragionamento resta in console: sulla TV rivelerebbe agli umani cosa
      // il bot ha gia dedotto, che e esattamente l'informazione da proteggere.
      console.debug(`[bot ${turn.playerId}] ${turn.action.type} — ${turn.rationale}`)
    }

    botTimer = setTimeout(() => {
      botTimer = null
      const current = get().game
      // Lo stato puo essere cambiato durante l'attesa: si riparte solo se
      // tocca ancora a quel bot.
      if (!current || botOnTheClock(current)?.id !== turn.playerId) {
        scheduleBot()
        return
      }
      set({ botMemories: turn.memories })
      get().dispatch(turn.action)
    }, botDelay(turn.action))
  }

  /** Ritrasmette lo stato pubblico e una vista privata per ogni giocatore. */
  const publish = (game: GameState, only?: string): void => {
    const { transport } = get()
    if (!transport) return
    transport.publishState(toPublicState(game))
    const targets = only ? game.players.filter((p) => p.id === only) : game.players
    for (const p of targets) {
      // I bot non passano dalla rete: il driver legge la loro vista privata
      // in locale, dallo stesso `toPrivateState` che serve i telefoni.
      if (p.bot) continue
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
    scheduleBot()
  }

  return {
    game: null,
    botMemories: {},
    transport: null,
    status: 'idle',
    transportKind: null,
    lastError: null,

    async newGame() {
      const game = createGame({ roomCode: newRoomCode(), seed: randomSeed() })
      cancelBot()
      set({ botMemories: {} })
      save(game, {})
      await attach(game)
    },

    async restore() {
      const saved = load()
      if (!saved) return false
      cancelBot()
      set({ botMemories: saved.botMemories ?? {} })
      await attach(saved.game)
      scheduleBot()
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
      save(state, get().botMemories)
      publish(state)
      scheduleBot()
    },

    resetGame() {
      const { game } = get()
      if (!game) return
      cancelBot()
      const fresh = createGame({ roomCode: game.roomCode, seed: randomSeed(), config: game.config })
      set({ game: fresh, botMemories: {} })
      save(fresh, {})
      publish(fresh)
    },

    async shutdown() {
      cancelBot()
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
