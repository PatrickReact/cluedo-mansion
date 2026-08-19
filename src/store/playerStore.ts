import { create } from 'zustand'
import type { Action } from '@/engine/actions'
import type { SuspectId } from '@/engine/constants'
import type { PrivateState, PublicState } from '@/engine/redact'
import type { CardKey } from '@/engine/types'
import { computeNotes, notesContext, type ColumnId, type Mark, type NotesResult } from '@/engine/notes'
import { createTransport, type ConnectionStatus, type Transport } from '@/net/createTransport'
import { newPlayerId, normalizeRoomCode } from '@/lib/roomCode'

/**
 * LO STORE DEL TELEFONO — il controller di un singolo giocatore.
 *
 * Non calcola mai le regole: manda intenti e disegna quello che l'host
 * ritrasmette. Le uniche cose che sa e che nessun altro sa sono la sua mano e
 * le carte che gli sono state mostrate: quelle restano qui e non risalgono mai
 * verso la TV.
 */

const ID_KEY = 'cluedo:playerId'
const NOTES_KEY = 'cluedo:notes:'
const SEEN_KEY = 'cluedo:seen:'

/** Id stabile fra i ricaricamenti: permette di riprendere la partita. */
function persistentPlayerId(): string {
  try {
    const existing = localStorage.getItem(ID_KEY)
    if (existing) return existing
    const fresh = newPlayerId()
    localStorage.setItem(ID_KEY, fresh)
    return fresh
  } catch {
    return newPlayerId()
  }
}

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage non disponibile: si perde solo la persistenza del taccuino
  }
}

type ManualNotes = Record<ColumnId, Record<string, Mark>>

interface PlayerState {
  playerId: string
  roomCode: string
  name: string
  status: ConnectionStatus
  transport: Transport | null

  publicState: PublicState | null
  privateState: PrivateState | null
  /** Ultimo rifiuto ricevuto dall'host, da mostrare come avviso. */
  error: string | null

  /** Carte viste: chiave carta -> id di chi l'ha mostrata. */
  seen: Record<string, string>
  /** Crocette messe a mano nel taccuino. */
  manualNotes: ManualNotes

  join: (roomCode: string, name: string, suspect: SuspectId) => Promise<void>
  connect: (roomCode: string) => Promise<void>
  send: (action: Action) => void
  setName: (name: string) => void
  cycleMark: (column: ColumnId, card: CardKey) => void
  clearError: () => void
  leave: () => Promise<void>
  notes: () => NotesResult | null
}

/** unknown -> not -> maybe -> has -> unknown */
const NEXT_MARK: Record<Mark, Mark> = {
  unknown: 'not',
  not: 'maybe',
  maybe: 'has',
  has: 'unknown',
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  playerId: persistentPlayerId(),
  roomCode: '',
  name: '',
  status: 'idle',
  transport: null,
  publicState: null,
  privateState: null,
  error: null,
  seen: {},
  manualNotes: {},

  async connect(rawCode) {
    const roomCode = normalizeRoomCode(rawCode)
    const { transport: existing, playerId } = get()
    if (existing?.roomCode === roomCode && existing.status === 'connected') return
    await existing?.disconnect()

    const transport = createTransport({
      roomCode,
      role: 'client',
      events: {
        onPublicState: (publicState) => set({ publicState }),
        onPrivateState: (privateState) => {
          set({ privateState })
          // Una carta appena mostrata entra nel taccuino e non ne esce piu.
          const reveal = privateState.reveal
          if (reveal) {
            const { seen, roomCode: code } = get()
            if (seen[reveal.card] !== reveal.fromPlayerId) {
              const next = { ...seen, [reveal.card]: reveal.fromPlayerId }
              set({ seen: next })
              writeJson(SEEN_KEY + code, next)
            }
          }
        },
        onError: (error) => set({ error }),
        onStatus: (status) => set({ status }),
      },
    })

    set({
      transport,
      roomCode,
      seen: readJson<Record<string, string>>(SEEN_KEY + roomCode, {}),
      manualNotes: readJson<ManualNotes>(NOTES_KEY + roomCode, {}),
    })

    await transport.connect()
    await transport.identify(playerId)
  },

  async join(rawCode, name, suspect) {
    await get().connect(rawCode)
    const { playerId, transport } = get()
    set({ name })
    try {
      localStorage.setItem('cluedo:name', name)
    } catch {
      // niente
    }
    transport?.sendIntent({ type: 'JOIN', playerId, name, suspect })
  },

  send(action) {
    get().transport?.sendIntent(action)
  },

  setName(name) {
    set({ name })
  },

  cycleMark(column, card) {
    const { manualNotes, roomCode } = get()
    const current = manualNotes[column]?.[card] ?? 'unknown'
    const next = NEXT_MARK[current]
    const updated: ManualNotes = {
      ...manualNotes,
      [column]: { ...(manualNotes[column] ?? {}), [card]: next },
    }
    set({ manualNotes: updated })
    writeJson(NOTES_KEY + roomCode, updated)
  },

  clearError() {
    set({ error: null })
  },

  async leave() {
    const { transport, playerId } = get()
    transport?.sendIntent({ type: 'LEAVE', playerId })
    await transport?.disconnect()
    set({ transport: null, publicState: null, privateState: null, status: 'idle' })
  },

  notes() {
    const { publicState, privateState, playerId, seen, manualNotes } = get()
    if (!publicState) return null
    // Il deduttore riceve solo il contesto pubblico piu cio che questo
    // giocatore ha visto: non esiste un percorso per cui possa vedere altro.
    return computeNotes(notesContext(publicState), {
      viewerId: playerId,
      hand: privateState?.hand ?? [],
      seen,
      manual: manualNotes,
    })
  },
}))

/** Nome salvato dall'ultima partita, per precompilare il modulo di ingresso. */
export const savedName = (): string => {
  try {
    return localStorage.getItem('cluedo:name') ?? ''
  } catch {
    return ''
  }
}
