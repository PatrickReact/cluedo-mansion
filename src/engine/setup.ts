import { ROOM_IDS, SUSPECT_IDS, WEAPON_IDS, WEAPONS } from './constants'
import type { RoomId, SuspectId, WeaponId } from './constants'
import { START_POSITIONS, TURN_ORDER, corridorAt } from './board'
import type { Position } from './board'
import { FULL_DECK, roomCard, suspectCard, weaponCard } from './cards'
import { createRng, shuffle, type RngState } from './rng'
import type { CardKey, GameConfig, GameState, Player, Solution } from './types'

export const DEFAULT_CONFIG: GameConfig = {
  classicWeaponPlacement: false,
  suggestionMoveGrantsSuggestion: true,
  diceCount: 2,
  turnTimeLimit: 0,
}

export function initialPositions(): Record<SuspectId, Position> {
  const out = {} as Record<SuspectId, Position>
  for (const id of SUSPECT_IDS) {
    const start = START_POSITIONS[id]
    out[id] = corridorAt(start.c, start.r)
  }
  return out
}

/** Distribuisce le 6 armi: una per stanza, senza ripetizioni. */
export function placeWeapons(rng: RngState, classic: boolean): [Record<WeaponId, RoomId>, RngState] {
  if (classic) {
    const out = {} as Record<WeaponId, RoomId>
    for (const w of WEAPONS) out[w.id] = w.classicRoom
    return [out, rng]
  }
  const [rooms, s] = shuffle(ROOM_IDS, rng)
  const out = {} as Record<WeaponId, RoomId>
  WEAPON_IDS.forEach((w, i) => {
    out[w] = rooms[i] as RoomId
  })
  return [out, s]
}

export interface DealResult {
  readonly solution: Solution
  readonly hands: readonly (readonly CardKey[])[]
  readonly rng: RngState
}

/**
 * Estrae la soluzione e distribuisce le 18 carte restanti a giro.
 * Con 4 o 5 giocatori le mani sono di dimensione diseguale: è corretto,
 * il regolamento non prevede scarti.
 */
export function dealCards(playerCount: number, rng: RngState): DealResult {
  const [suspects, r1] = shuffle(SUSPECT_IDS, rng)
  const [weapons, r2] = shuffle(WEAPON_IDS, r1)
  const [rooms, r3] = shuffle(ROOM_IDS, r2)

  const solution: Solution = {
    suspect: suspects[0] as SuspectId,
    weapon: weapons[0] as WeaponId,
    room: rooms[0] as RoomId,
  }
  const solutionSet = new Set<CardKey>([
    suspectCard(solution.suspect),
    weaponCard(solution.weapon),
    roomCard(solution.room),
  ])

  const rest = FULL_DECK.filter((c) => !solutionSet.has(c))
  const [deck, r4] = shuffle(rest, r3)

  const hands: CardKey[][] = Array.from({ length: playerCount }, () => [])
  deck.forEach((card, i) => {
    hands[i % playerCount]?.push(card)
  })

  return { solution, hands, rng: r4 }
}

export interface CreateGameOptions {
  readonly roomCode: string
  readonly seed: number
  readonly config?: Partial<GameConfig>
}

/** Partita vuota in lobby, senza carte distribuite. */
export function createGame({ roomCode, seed, config }: CreateGameOptions): GameState {
  const [weapons, rng] = placeWeapons(createRng(seed), config?.classicWeaponPlacement ?? false)
  return {
    version: 1,
    roomCode,
    config: { ...DEFAULT_CONFIG, ...config },
    rng,
    players: [],
    turnIndex: 0,
    turnOrder: TURN_ORDER,
    turnNumber: 0,
    phase: { kind: 'lobby' },
    solution: null,
    positions: initialPositions(),
    weapons,
    leftRoomThisTurn: null,
    draggedBySuggestion: [],
    log: [],
    history: [],
    lastPath: [],
    startedAt: null,
    updatedAt: 0,
  }
}

/** Ordine di turno reale: i personaggi occupati, in ordine canonico. */
export function seatedTurnOrder(players: readonly Player[]): SuspectId[] {
  const seated = new Set(players.map((p) => p.suspect))
  return TURN_ORDER.filter((s) => seated.has(s))
}
