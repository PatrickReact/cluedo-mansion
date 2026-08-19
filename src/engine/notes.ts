import { ROOM_IDS, SUSPECT_IDS, WEAPON_IDS } from './constants'
import type { RoomId, SuspectId, WeaponId } from './constants'
import { FULL_DECK, roomCard, solutionCards, suspectCard, weaponCard } from './cards'
import type { CardKey, GameState, Player } from './types'

/**
 * IL TACCUINO DELL'INVESTIGATORE
 *
 * Due livelli sovrapposti:
 *  1. `auto` — dedotto dai fatti pubblici (chi ha passato, chi ha confutato)
 *     piu le carte che il giocatore ha visto di persona. Non e mai sbagliato.
 *  2. `manual` — le crocette che il giocatore mette a mano, per intuizioni e
 *     bluff. Sovrascrivono l'automatico solo dove l'automatico non sa nulla.
 *
 * La deduzione gira a punto fisso: ogni fatto nuovo puo sbloccarne altri.
 */

/** Stato di una casella del taccuino. */
export type Mark =
  /** Nessuna informazione. */
  | 'unknown'
  /** Certo: questo giocatore ha questa carta. */
  | 'has'
  /** Certo: questo giocatore NON ha questa carta. */
  | 'not'
  /** Sospetto personale del giocatore, non una certezza. */
  | 'maybe'

/** Colonna virtuale per la busta della soluzione. */
export const ENVELOPE = '__envelope__'

export type ColumnId = string

/** Vincolo "questo giocatore ha almeno una fra queste carte". */
export interface Constraint {
  readonly playerId: string
  readonly cards: readonly CardKey[]
}

export interface NotesInput {
  /** Il giocatore per cui si calcola il taccuino. */
  readonly viewerId: string
  /** Mano del giocatore che guarda. */
  readonly hand: readonly CardKey[]
  /**
   * Carte che il giocatore ha visto: chiave carta -> id di chi l'ha mostrata.
   * Sono informazioni private, tracciate lato telefono.
   */
  readonly seen: Readonly<Record<string, string>>
  /** Segni manuali: colonna -> carta -> segno. */
  readonly manual: Readonly<Record<ColumnId, Readonly<Record<string, Mark>>>>
}

export interface NotesResult {
  /** Griglia completa: colonna -> carta -> segno. */
  readonly grid: Readonly<Record<ColumnId, Readonly<Record<string, Mark>>>>
  /** true se il segno viene dalla deduzione e non e modificabile a mano. */
  readonly locked: Readonly<Record<ColumnId, Readonly<Record<string, boolean>>>>
  readonly constraints: readonly Constraint[]
  /** Carte ancora possibili per la soluzione. */
  readonly candidates: {
    readonly suspects: readonly SuspectId[]
    readonly weapons: readonly WeaponId[]
    readonly rooms: readonly RoomId[]
  }
  /** Soluzione dedotta con certezza, se il taccuino basta gia a chiuderla. */
  readonly solved: { readonly suspect: SuspectId; readonly weapon: WeaponId; readonly room: RoomId } | null
}

type MutableGrid = Record<ColumnId, Record<string, Mark>>

const emptyColumn = (): Record<string, Mark> => {
  const col: Record<string, Mark> = {}
  for (const card of FULL_DECK) col[card] = 'unknown'
  return col
}

/**
 * Calcola il taccuino di un giocatore a partire dallo stato pubblico della
 * partita piu le sue informazioni private.
 */
export function computeNotes(state: GameState, input: NotesInput): NotesResult {
  const humans = state.players.filter((p) => !p.isNpc)
  const columns: ColumnId[] = [...humans.map((p) => p.id), ENVELOPE]

  const grid: MutableGrid = {}
  const locked: Record<ColumnId, Record<string, boolean>> = {}
  for (const col of columns) {
    grid[col] = emptyColumn()
    locked[col] = {}
  }

  const setFact = (col: ColumnId, card: CardKey, mark: 'has' | 'not'): boolean => {
    const column = grid[col]
    const lock = locked[col]
    if (!column || !lock) return false
    if (column[card] === mark && lock[card]) return false
    column[card] = mark
    lock[card] = true
    return true
  }

  // --- fatti diretti ------------------------------------------------------

  // 1. Le carte in mano: le ho io, quindi nessun altro le ha e non sono nella busta.
  for (const card of input.hand) setFact(input.viewerId, card, 'has')

  // 2. Le carte che mi sono state mostrate: chi me le ha mostrate le possiede.
  for (const [card, ownerId] of Object.entries(input.seen)) {
    if (columns.includes(ownerId)) setFact(ownerId, card as CardKey, 'has')
  }

  // 3. Chi non ha potuto confutare non ha nessuna delle tre carte nominate.
  const constraints: Constraint[] = []
  for (const rec of state.history) {
    const named = solutionCards(rec.suggestion)
    for (const pid of rec.passed) {
      for (const card of named) setFact(pid, card, 'not')
    }
    if (rec.disprovedBy && rec.disprovedBy !== input.viewerId) {
      // So che ha confutato, ma non con quale carta: e un vincolo, non un fatto.
      const alreadyKnown = named.some((c) => grid[rec.disprovedBy as string]?.[c] === 'has')
      if (!alreadyKnown) constraints.push({ playerId: rec.disprovedBy, cards: named })
    }
  }

  // --- chiusura deduttiva a punto fisso -----------------------------------

  const cardsPerPlayer = expectedHandSizes(state)

  for (let pass = 0; pass < 12; pass++) {
    let changed = false

    // A. Una carta appartiene a una sola colonna: se qualcuno ce l'ha, gli altri no.
    for (const card of FULL_DECK) {
      const owner = columns.find((col) => grid[col]?.[card] === 'has')
      if (!owner) continue
      for (const col of columns) {
        if (col !== owner && grid[col]?.[card] !== 'not') changed = setFact(col, card, 'not') || changed
      }
    }

    // B. Se tutti tranne uno hanno 'not', quella colonna ha la carta.
    for (const card of FULL_DECK) {
      const possible = columns.filter((col) => grid[col]?.[card] !== 'not')
      if (possible.length === 1 && possible[0] && grid[possible[0]]?.[card] !== 'has') {
        changed = setFact(possible[0], card, 'has') || changed
      }
    }

    // C. Vincoli: se restano possibili solo una carta, quella e la sua.
    for (const constraint of constraints) {
      const open = constraint.cards.filter((c) => grid[constraint.playerId]?.[c] !== 'not')
      if (open.length === 1 && open[0] && grid[constraint.playerId]?.[open[0]] !== 'has') {
        changed = setFact(constraint.playerId, open[0], 'has') || changed
      }
    }

    // D. La busta contiene esattamente un sospetto, un'arma e una stanza:
    //    se in una categoria resta un solo candidato, e quello.
    for (const [group, keys] of categoryEntries()) {
      const open = keys.filter((c) => grid[ENVELOPE]?.[c] !== 'not')
      const found = keys.find((c) => grid[ENVELOPE]?.[c] === 'has')
      if (found) {
        for (const c of keys) if (c !== found) changed = setFact(ENVELOPE, c, 'not') || changed
      } else if (open.length === 1 && open[0]) {
        changed = setFact(ENVELOPE, open[0], 'has') || changed
      }
      void group
    }

    // E. Mano piena: se un giocatore ha gia tutte le sue carte, non ha le altre.
    for (const p of humans) {
      const size = cardsPerPlayer.get(p.id)
      if (size === undefined) continue
      const known = FULL_DECK.filter((c) => grid[p.id]?.[c] === 'has').length
      if (known === size) {
        for (const c of FULL_DECK)
          if (grid[p.id]?.[c] === 'unknown') changed = setFact(p.id, c, 'not') || changed
      }
    }

    if (!changed) break
  }

  // --- segni manuali, solo dove la deduzione tace -------------------------

  for (const [col, marks] of Object.entries(input.manual)) {
    const column = grid[col]
    const lock = locked[col]
    if (!column || !lock) continue
    for (const [card, mark] of Object.entries(marks)) {
      if (lock[card]) continue
      column[card] = mark
    }
  }

  // --- candidati residui --------------------------------------------------

  const openIn = <T extends string>(ids: readonly T[], toKey: (id: T) => CardKey): T[] =>
    ids.filter((id) => grid[ENVELOPE]?.[toKey(id)] !== 'not')

  const suspects = openIn(SUSPECT_IDS, suspectCard)
  const weapons = openIn(WEAPON_IDS, weaponCard)
  const rooms = openIn(ROOM_IDS, roomCard)

  const solved =
    suspects.length === 1 && weapons.length === 1 && rooms.length === 1
      ? { suspect: suspects[0] as SuspectId, weapon: weapons[0] as WeaponId, room: rooms[0] as RoomId }
      : null

  return { grid, locked, constraints, candidates: { suspects, weapons, rooms }, solved }
}

function categoryEntries(): [string, readonly CardKey[]][] {
  return [
    ['suspect', SUSPECT_IDS.map(suspectCard)],
    ['weapon', WEAPON_IDS.map(weaponCard)],
    ['room', ROOM_IDS.map(roomCard)],
  ]
}

/**
 * Quante carte ha in mano ciascun giocatore.
 *
 * Con 4 o 5 giocatori le mani sono diseguali: la distribuzione segue l'ordine
 * di turno e chi viene prima riceve la carta in piu. E informazione pubblica
 * (tutti vedono quante carte ha ciascuno) e chiude molte deduzioni.
 */
export function expectedHandSizes(state: GameState): Map<string, number> {
  const humans = state.players.filter((p) => !p.isNpc)
  const out = new Map<string, number>()
  if (humans.length === 0) return out

  const ordered = state.turnOrder
    .map((suspect) => humans.find((p) => p.suspect === suspect))
    .filter((p): p is Player => Boolean(p))
  const seats = ordered.length > 0 ? ordered : humans

  const total = 18
  const base = Math.floor(total / seats.length)
  const extra = total % seats.length
  seats.forEach((p, i) => out.set(p.id, base + (i < extra ? 1 : 0)))
  return out
}
