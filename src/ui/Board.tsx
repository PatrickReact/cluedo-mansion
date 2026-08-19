import { memo, useMemo } from 'react'
import { motion } from 'motion/react'
import { board, type Coord } from '@/engine/board'
import { ROOMS, SUSPECTS, SUSPECT_BY_ID, WEAPON_BY_ID } from '@/engine/constants'
import type { RoomId, SuspectId, WeaponId } from '@/engine/constants'
import type { Position } from '@/engine/board'

/**
 * IL TABELLONE
 *
 * Disegnato interamente in SVG a partire dalla mappa ASCII: nessuna immagine
 * di sfondo, quindi scala senza sfocare da un telefono a una TV 4K e resta
 * coerente se si modifica la mappa.
 *
 * Lo stesso componente serve due schermi molto diversi:
 *  - in TV e grande e mostra i percorsi animati;
 *  - sul telefono e piccolo e interattivo, per scegliere dove muoversi.
 */

const CELL = 32
const GAP = 1.5

export interface BoardProps {
  readonly positions: Readonly<Record<SuspectId, Position>>
  readonly weapons: Readonly<Record<WeaponId, RoomId>>
  /** Caselle di corridoio selezionabili, chiave "c,r". */
  readonly reachableCorridors?: ReadonlySet<string>
  readonly reachableRooms?: ReadonlySet<RoomId>
  /** Percorso dell'ultima mossa, animato. */
  readonly path?: readonly Coord[]
  /** Personaggio di turno, evidenziato. */
  readonly activeSuspect?: SuspectId | null
  readonly onPickCorridor?: (at: Coord) => void
  readonly onPickRoom?: (room: RoomId) => void
  readonly className?: string
  /** In TV le pedine sono piu grandi e i tocchi disabilitati. */
  readonly variant?: 'tv' | 'phone'
}

/** Rettangolo che racchiude tutte le caselle di una stanza. */
interface RoomBox {
  readonly id: RoomId
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly cx: number
  readonly cy: number
}

function computeRoomBoxes(): RoomBox[] {
  const out: RoomBox[] = []
  for (const room of ROOMS) {
    const tiles = board.roomTiles.get(room.id)
    if (!tiles || tiles.length === 0) continue
    const cols = tiles.map((t) => t.c)
    const rows = tiles.map((t) => t.r)
    const minC = Math.min(...cols)
    const maxC = Math.max(...cols)
    const minR = Math.min(...rows)
    const maxR = Math.max(...rows)
    const x = minC * CELL
    const y = minR * CELL
    const w = (maxC - minC + 1) * CELL
    const h = (maxR - minR + 1) * CELL
    out.push({ id: room.id, x, y, w, h, cx: x + w / 2, cy: y + h / 2 })
  }
  return out
}

/** Posizioni delle pedine dentro una stanza, disposte in griglia. */
function slotInRoom(box: RoomBox, index: number, total: number): { x: number; y: number } {
  const perRow = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(total))))
  const rows = Math.ceil(total / perRow)
  const col = index % perRow
  const row = Math.floor(index / perRow)
  const spacing = CELL * 0.92
  const x = box.cx + (col - (perRow - 1) / 2) * spacing
  const y = box.cy + (row - (rows - 1) / 2) * spacing + CELL * 0.35
  return { x, y }
}

export const Board = memo(function Board({
  positions,
  weapons,
  reachableCorridors,
  reachableRooms,
  path,
  activeSuspect,
  onPickCorridor,
  onPickRoom,
  className,
  variant = 'tv',
}: BoardProps) {
  const width = board.width * CELL
  const height = board.height * CELL
  const boxes = useMemo(() => computeRoomBoxes(), [])
  const boxById = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes])

  const tokenR = variant === 'tv' ? CELL * 0.42 : CELL * 0.38

  // Raggruppa le pedine per stanza, per disporle senza sovrapposizioni.
  const occupantsByRoom = useMemo(() => {
    const map = new Map<RoomId, SuspectId[]>()
    for (const s of SUSPECTS) {
      const pos = positions[s.id]
      if (pos?.kind === 'room') {
        const list = map.get(pos.room)
        if (list) list.push(s.id)
        else map.set(pos.room, [s.id])
      }
    }
    return map
  }, [positions])

  const weaponsByRoom = useMemo(() => {
    const map = new Map<RoomId, WeaponId[]>()
    for (const [w, room] of Object.entries(weapons) as [WeaponId, RoomId][]) {
      const list = map.get(room)
      if (list) list.push(w)
      else map.set(room, [w])
    }
    return map
  }, [weapons])

  const pathD = useMemo(() => {
    if (!path || path.length < 2) return null
    return path
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.c * CELL + CELL / 2} ${p.r * CELL + CELL / 2}`)
      .join(' ')
  }, [path])

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="Tabellone di Tudor Mansion"
    >
      <defs>
        <linearGradient id="board-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#171426" />
          <stop offset="100%" stopColor="#0d0b16" />
        </linearGradient>
        <linearGradient id="room-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3457" />
          <stop offset="100%" stopColor="#241f3a" />
        </linearGradient>
        <filter id="token-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#000" floodOpacity="0.65" />
        </filter>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={width} height={height} fill="url(#board-bg)" />

      {/* --- corridoi: una tessera per casella, a scacchiera tenue --- */}
      <g>
        {board.tiles.flat().map((tile) => {
          if (tile.kind !== 'corridor') return null
          const k = `${tile.c},${tile.r}`
          const isReachable = reachableCorridors?.has(k) ?? false
          const shade = (tile.c + tile.r) % 2 === 0 ? 'var(--color-corridor)' : 'var(--color-corridor-alt)'
          return (
            <g key={k}>
              <rect
                x={tile.c * CELL + GAP}
                y={tile.r * CELL + GAP}
                width={CELL - GAP * 2}
                height={CELL - GAP * 2}
                rx={3}
                fill={shade}
                opacity={0.9}
              />
              {isReachable && (
                <rect
                  x={tile.c * CELL + GAP}
                  y={tile.r * CELL + GAP}
                  width={CELL - GAP * 2}
                  height={CELL - GAP * 2}
                  rx={3}
                  fill="var(--color-gold)"
                  className="reachable cursor-pointer"
                  onClick={() => onPickCorridor?.({ c: tile.c, r: tile.r })}
                />
              )}
              {isReachable && onPickCorridor && (
                <rect
                  x={tile.c * CELL}
                  y={tile.r * CELL}
                  width={CELL}
                  height={CELL}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => onPickCorridor({ c: tile.c, r: tile.r })}
                />
              )}
            </g>
          )
        })}
      </g>

      {/* --- stanze --- */}
      <g>
        {boxes.map((box) => {
          const room = ROOMS.find((r) => r.id === box.id)
          if (!room) return null
          const isReachable = reachableRooms?.has(box.id) ?? false
          return (
            <g key={box.id}>
              <rect
                x={box.x + 3}
                y={box.y + 3}
                width={box.w - 6}
                height={box.h - 6}
                rx={6}
                fill="url(#room-fill)"
                stroke={isReachable ? 'var(--color-gold)' : 'var(--color-room-edge)'}
                strokeWidth={isReachable ? 3.5 : 1.6}
                strokeOpacity={isReachable ? 1 : 0.55}
                className={isReachable ? 'reachable' : undefined}
              />
              <text
                x={box.cx}
                y={box.y + 22}
                textAnchor="middle"
                fill="var(--color-paper-dim)"
                fontSize={13}
                fontFamily="Georgia, serif"
                letterSpacing="1.2"
                opacity={0.85}
              >
                {room.name.toUpperCase()}
              </text>
              {room.secretPassageTo && (
                <g opacity={0.6}>
                  <circle
                    cx={box.cx}
                    cy={box.y + box.h - 20}
                    r={9}
                    fill="none"
                    stroke="var(--color-gold)"
                    strokeWidth={1.4}
                  />
                  <path
                    d={`M ${box.cx - 4} ${box.y + box.h - 20} h 8 m -3 -3 l 3 3 l -3 3`}
                    stroke="var(--color-gold)"
                    strokeWidth={1.4}
                    fill="none"
                  />
                </g>
              )}
              {isReachable && onPickRoom && (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => onPickRoom(box.id)}
                />
              )}
            </g>
          )
        })}
      </g>

      {/* --- cantina centrale: la busta --- */}
      <g>
        {(() => {
          const tiles = board.tiles.flat().filter((t) => t.kind === 'cellar')
          if (tiles.length === 0) return null
          const minC = Math.min(...tiles.map((t) => t.c))
          const maxC = Math.max(...tiles.map((t) => t.c))
          const minR = Math.min(...tiles.map((t) => t.r))
          const maxR = Math.max(...tiles.map((t) => t.r))
          const x = minC * CELL
          const y = minR * CELL
          const w = (maxC - minC + 1) * CELL
          const h = (maxR - minR + 1) * CELL
          return (
            <g>
              <rect
                x={x + 4}
                y={y + 4}
                width={w - 8}
                height={h - 8}
                rx={5}
                fill="var(--color-cellar)"
                stroke="var(--color-blood)"
                strokeWidth={2}
                strokeOpacity={0.7}
              />
              <text
                x={x + w / 2}
                y={y + h / 2 - 8}
                textAnchor="middle"
                fill="var(--color-gold)"
                fontSize={15}
                fontFamily="Georgia, serif"
                letterSpacing="2"
              >
                CANTINA
              </text>
              <text
                x={x + w / 2}
                y={y + h / 2 + 14}
                textAnchor="middle"
                fill="var(--color-paper-dim)"
                fontSize={11}
                opacity={0.7}
              >
                la busta sigillata
              </text>
            </g>
          )
        })()}
      </g>

      {/* --- porte: un trattino dorato sulla soglia --- */}
      <g>
        {board.doors.map((d, i) => {
          const dx = d.corridor.c - d.threshold.c
          const dy = d.corridor.r - d.threshold.r
          const x = d.threshold.c * CELL + CELL / 2 + (dx * CELL) / 2
          const y = d.threshold.r * CELL + CELL / 2 + (dy * CELL) / 2
          const horizontal = dx !== 0
          return (
            <rect
              key={i}
              x={x - (horizontal ? 2 : CELL * 0.3)}
              y={y - (horizontal ? CELL * 0.3 : 2)}
              width={horizontal ? 4 : CELL * 0.6}
              height={horizontal ? CELL * 0.6 : 4}
              rx={2}
              fill="var(--color-gold)"
              opacity={0.9}
            />
          )
        })}
      </g>

      {/* --- percorso dell'ultima mossa --- */}
      {pathD && (
        <motion.path
          d={pathD}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="6 6"
          opacity={0.85}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}

      {/* --- armi --- */}
      <g>
        {[...weaponsByRoom.entries()].map(([room, list]) => {
          const box = boxById.get(room)
          if (!box) return null
          return list.map((w, i) => {
            const x = box.x + 16 + i * 20
            const y = box.y + box.h - 14
            return (
              <g key={w} transform={`translate(${x} ${y})`}>
                <title>{WEAPON_BY_ID[w].name}</title>
                <circle
                  r={9}
                  fill="var(--color-ink)"
                  stroke="var(--color-gold)"
                  strokeWidth={1.2}
                  opacity={0.95}
                />
                <image href={`/assets/weapons/${w}.svg`} x={-7} y={-7} width={14} height={14} />
              </g>
            )
          })
        })}
      </g>

      {/* --- pedine --- */}
      <g>
        {SUSPECTS.map((s) => {
          const pos = positions[s.id]
          if (!pos) return null

          let x: number
          let y: number
          if (pos.kind === 'corridor') {
            x = pos.at.c * CELL + CELL / 2
            y = pos.at.r * CELL + CELL / 2
          } else {
            const box = boxById.get(pos.room)
            if (!box) return null
            const occupants = occupantsByRoom.get(pos.room) ?? []
            const slot = slotInRoom(box, occupants.indexOf(s.id), occupants.length)
            x = slot.x
            y = slot.y
          }

          const isActive = activeSuspect === s.id
          return (
            <motion.g
              key={s.id}
              animate={{ x, y }}
              initial={false}
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              filter="url(#token-shadow)"
            >
              <title>{s.name}</title>
              {isActive && (
                <circle
                  r={tokenR + 6}
                  fill="none"
                  stroke="var(--color-gold)"
                  strokeWidth={2.5}
                  className="reachable"
                  filter="url(#glow)"
                />
              )}
              <circle r={tokenR} fill={s.color} stroke="var(--color-ink)" strokeWidth={2} />
              <circle r={tokenR - 4} fill="none" stroke="#fff" strokeWidth={1} opacity={0.35} />
              <text
                textAnchor="middle"
                y={tokenR * 0.36}
                fontSize={tokenR * 1.05}
                fontFamily="Georgia, serif"
                fontWeight="bold"
                fill={s.ink}
              >
                {SUSPECT_BY_ID[s.id].shortName.charAt(0)}
              </text>
            </motion.g>
          )
        })}
      </g>
    </svg>
  )
})
