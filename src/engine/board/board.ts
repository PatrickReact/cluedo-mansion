import { CELLAR_GLYPH, ROOMS, type RoomId } from '../constants'
import { BOARD_HEIGHT, BOARD_MAP, BOARD_WIDTH, DOORS, type Coord, type Door } from './map'

export type TileKind = 'void' | 'corridor' | 'room' | 'cellar'

export interface Tile {
  readonly c: number
  readonly r: number
  readonly kind: TileKind
  readonly room: RoomId | null
  /** true se è una casella-soglia disegnata come porta. */
  readonly isThreshold: boolean
}

const GLYPH_TO_ROOM = new Map<string, RoomId>(ROOMS.map((r) => [r.glyph, r.id]))

export const key = (c: number, r: number): string => `${c},${r}`
export const coordKey = (p: Coord): string => key(p.c, p.r)
export const parseKey = (k: string): Coord => {
  const [c, r] = k.split(',')
  return { c: Number(c), r: Number(r) }
}

function buildTiles(): Tile[][] {
  const thresholds = new Set(DOORS.map((d) => coordKey(d.threshold)))
  const grid: Tile[][] = []
  for (let r = 0; r < BOARD_HEIGHT; r++) {
    const row: Tile[] = []
    const line = BOARD_MAP[r] ?? ''
    for (let c = 0; c < BOARD_WIDTH; c++) {
      const ch = line[c] ?? '#'
      let kind: TileKind = 'void'
      let room: RoomId | null = null
      if (ch === '.') kind = 'corridor'
      else if (ch === CELLAR_GLYPH) kind = 'cellar'
      else {
        const rid = GLYPH_TO_ROOM.get(ch)
        if (rid) {
          kind = 'room'
          room = rid
        }
      }
      row.push({ c, r, kind, room, isThreshold: thresholds.has(key(c, r)) })
    }
    grid.push(row)
  }
  return grid
}

export interface Board {
  readonly width: number
  readonly height: number
  readonly tiles: readonly (readonly Tile[])[]
  readonly doors: readonly Door[]
  /** Caselle di corridoio davanti a una porta, indicizzate per coordinata. */
  readonly doorsByCorridor: ReadonlyMap<string, readonly Door[]>
  /** Porte di ciascuna stanza. */
  readonly doorsByRoom: ReadonlyMap<RoomId, readonly Door[]>
  /** Tutte le caselle di una stanza (per il posizionamento delle pedine). */
  readonly roomTiles: ReadonlyMap<RoomId, readonly Coord[]>
  tileAt(c: number, r: number): Tile | null
  isWalkableCorridor(c: number, r: number): boolean
  roomAt(c: number, r: number): RoomId | null
}

function buildBoard(): Board {
  const tiles = buildTiles()

  const doorsByCorridor = new Map<string, Door[]>()
  const doorsByRoom = new Map<RoomId, Door[]>()
  for (const d of DOORS) {
    const k = coordKey(d.corridor)
    const list = doorsByCorridor.get(k)
    if (list) list.push(d)
    else doorsByCorridor.set(k, [d])
    const rl = doorsByRoom.get(d.room)
    if (rl) rl.push(d)
    else doorsByRoom.set(d.room, [d])
  }

  const roomTiles = new Map<RoomId, Coord[]>()
  for (const row of tiles) {
    for (const t of row) {
      if (t.kind === 'room' && t.room) {
        const list = roomTiles.get(t.room)
        if (list) list.push({ c: t.c, r: t.r })
        else roomTiles.set(t.room, [{ c: t.c, r: t.r }])
      }
    }
  }

  const tileAt = (c: number, r: number): Tile | null => {
    if (r < 0 || r >= BOARD_HEIGHT || c < 0 || c >= BOARD_WIDTH) return null
    return tiles[r]?.[c] ?? null
  }

  return {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    tiles,
    doors: DOORS,
    doorsByCorridor,
    doorsByRoom,
    roomTiles,
    tileAt,
    isWalkableCorridor: (c, r) => tileAt(c, r)?.kind === 'corridor',
    roomAt: (c, r) => tileAt(c, r)?.room ?? null,
  }
}

/** Il tabellone è immutabile: costruito una volta sola all'avvio. */
export const board: Board = buildBoard()

export const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const

/** Stanze raggiungibili da `room` tramite passaggio segreto. */
export function secretPassageFrom(room: RoomId): RoomId | null {
  return ROOMS.find((r) => r.id === room)?.secretPassageTo ?? null
}
