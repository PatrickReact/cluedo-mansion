import type { RoomId } from '../constants'
import { ORTHOGONAL, board, coordKey, key } from './board'
import type { Coord } from './map'

/**
 * Posizione di una pedina: o una casella di corridoio, o dentro una stanza.
 * Le stanze non hanno caselle interne "occupabili" ai fini del blocco: più
 * pedine possono coesistere nella stessa stanza.
 */
export type Position =
  { readonly kind: 'corridor'; readonly at: Coord } | { readonly kind: 'room'; readonly room: RoomId }

export const corridorAt = (c: number, r: number): Position => ({ kind: 'corridor', at: { c, r } })
export const inRoom = (room: RoomId): Position => ({ kind: 'room', room })

export interface MoveTarget {
  /** Costo in passi (<= tiro dei dadi). */
  readonly steps: number
  /** Percorso completo dalla partenza, per l'animazione sulla TV. */
  readonly path: readonly Coord[]
}

export interface ReachableResult {
  /** Caselle di corridoio raggiungibili, per chiave "c,r". */
  readonly corridors: ReadonlyMap<string, MoveTarget>
  /** Stanze in cui si può entrare, con il percorso fino alla porta. */
  readonly rooms: ReadonlyMap<RoomId, MoveTarget>
}

export interface ReachOptions {
  /** Caselle di corridoio occupate da altre pedine: bloccano il passaggio. */
  readonly blocked?: ReadonlySet<string>
  /**
   * Stanza da cui il giocatore è uscito in questo turno: non può rientrarci.
   * Regola ufficiale: "you may not re-enter a room you left on the same turn".
   */
  readonly forbiddenRoom?: RoomId | null
}

/**
 * BFS a 4 direzioni dalla posizione corrente, limitato al tiro dei dadi.
 *
 * Regole implementate:
 *  - solo movimenti ortogonali, mai in diagonale né attraverso i muri;
 *  - non si attraversa né si sosta su una casella occupata da un'altra pedina;
 *  - entrare in una stanza consuma un passo e TERMINA il movimento
 *    (il resto del tiro viene perso: "exact movement is not needed");
 *  - uscendo da una stanza si parte da una qualsiasi delle sue porte, e il
 *    primo passo è quello che porta sulla casella di corridoio esterna;
 *  - non si può rientrare nella stanza da cui si è usciti nello stesso turno.
 */
export function reachable(from: Position, dice: number, opts: ReachOptions = {}): ReachableResult {
  const blocked = opts.blocked ?? new Set<string>()
  const forbidden = opts.forbiddenRoom ?? null

  const corridors = new Map<string, MoveTarget>()
  const rooms = new Map<RoomId, MoveTarget>()
  const best = new Map<string, number>()

  interface Node {
    readonly c: number
    readonly r: number
    readonly steps: number
    readonly path: readonly Coord[]
  }
  const queue: Node[] = []

  const pushStart = (c: number, r: number, steps: number, path: readonly Coord[]) => {
    const k = key(c, r)
    if (blocked.has(k)) return
    if (!board.isWalkableCorridor(c, r)) return
    const prev = best.get(k)
    if (prev !== undefined && prev <= steps) return
    best.set(k, steps)
    const node: Node = { c, r, steps, path }
    queue.push(node)
    const existing = corridors.get(k)
    if (!existing || existing.steps > steps) corridors.set(k, { steps, path })
  }

  if (from.kind === 'corridor') {
    const k = coordKey(from.at)
    best.set(k, 0)
    queue.push({ c: from.at.c, r: from.at.r, steps: 0, path: [from.at] })
  } else {
    // Uscita da una stanza: ogni porta costa 1 passo per arrivare in corridoio.
    const doors = board.doorsByRoom.get(from.room) ?? []
    for (const d of doors) {
      pushStart(d.corridor.c, d.corridor.r, 1, [d.threshold, d.corridor])
    }
    // Passaggio segreto: mossa gratuita, gestita a parte nel reducer.
  }

  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    if (node.steps >= dice) continue

    for (const [dc, dr] of ORTHOGONAL) {
      const nc = node.c + dc
      const nr = node.r + dr
      const tile = board.tileAt(nc, nr)
      if (!tile) continue
      if (tile.kind === 'void' || tile.kind === 'cellar') continue

      if (tile.kind === 'room') {
        // Si entra solo da una porta: il tile deve essere la soglia di una
        // porta la cui casella di corridoio è quella attuale.
        const doorsHere = board.doorsByCorridor.get(key(node.c, node.r)) ?? []
        const door = doorsHere.find((d) => d.threshold.c === nc && d.threshold.r === nr)
        if (!door) continue
        if (door.room === forbidden) continue
        const steps = node.steps + 1
        const existing = rooms.get(door.room)
        if (!existing || existing.steps > steps) {
          rooms.set(door.room, { steps, path: [...node.path, { c: nc, r: nr }] })
        }
        continue // entrare termina il movimento: non si prosegue oltre
      }

      const nk = key(nc, nr)
      if (blocked.has(nk)) continue
      const steps = node.steps + 1
      const prev = best.get(nk)
      if (prev !== undefined && prev <= steps) continue
      best.set(nk, steps)
      const path = [...node.path, { c: nc, r: nr }]
      queue.push({ c: nc, r: nr, steps, path })
      const existing = corridors.get(nk)
      if (!existing || existing.steps > steps) corridors.set(nk, { steps, path })
    }
  }

  // La casella di partenza non è una destinazione valida.
  if (from.kind === 'corridor') corridors.delete(coordKey(from.at))

  return { corridors, rooms }
}

/** Distanza minima in passi fra due posizioni, ignorando le pedine. */
export function distance(from: Position, to: Position): number {
  const seen = new Set<string>()
  let frontier: Position[] = [from]
  for (let d = 0; d <= 60 && frontier.length > 0; d++) {
    const next: Position[] = []
    for (const p of frontier) {
      const id = p.kind === 'room' ? `R:${p.room}` : coordKey(p.at)
      if (seen.has(id)) continue
      seen.add(id)
      if (p.kind === 'room' && to.kind === 'room' && p.room === to.room) return d
      if (p.kind === 'corridor' && to.kind === 'corridor' && p.at.c === to.at.c && p.at.r === to.at.r)
        return d

      if (p.kind === 'room') {
        for (const door of board.doorsByRoom.get(p.room) ?? [])
          next.push(corridorAt(door.corridor.c, door.corridor.r))
      } else {
        for (const [dc, dr] of ORTHOGONAL) {
          const nc = p.at.c + dc
          const nr = p.at.r + dr
          if (board.isWalkableCorridor(nc, nr)) next.push(corridorAt(nc, nr))
        }
        for (const door of board.doorsByCorridor.get(coordKey(p.at)) ?? []) next.push(inRoom(door.room))
      }
    }
    frontier = next
  }
  return Number.POSITIVE_INFINITY
}
