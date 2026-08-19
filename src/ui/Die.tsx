import { motion } from 'motion/react'

/** Disposizione dei punti per ciascuna faccia, su una griglia 3x3. */
const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
}

interface DieProps {
  readonly value: number
  readonly size?: number
  readonly rolling?: boolean
}

/** Un dado a sei facce, disegnato in SVG e animato al tiro. */
export function Die({ value, size = 56, rolling = false }: DieProps) {
  const pips = PIPS[Math.min(6, Math.max(1, value))] ?? PIPS[1] ?? []
  const unit = size / 4

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      animate={rolling ? { rotate: [0, -18, 22, -12, 0], scale: [1, 1.12, 0.95, 1.05, 1] } : { rotate: 0 }}
      transition={
        rolling ? { duration: 0.7, ease: 'easeOut' } : { type: 'spring', stiffness: 260, damping: 18 }
      }
      role="img"
      aria-label={`Dado: ${value}`}
    >
      <rect
        x="6"
        y="6"
        width="88"
        height="88"
        rx="18"
        fill="var(--color-paper)"
        stroke="var(--color-ink)"
        strokeWidth="4"
      />
      <rect
        x="14"
        y="14"
        width="72"
        height="72"
        rx="12"
        fill="none"
        stroke="var(--color-ink)"
        strokeOpacity="0.12"
        strokeWidth="2"
      />
      {pips.map(([col, row], i) => (
        <circle key={i} cx={26 + col * 24} cy={26 + row * 24} r={8.5} fill="var(--color-ink)" />
      ))}
      <title>{value}</title>
      <desc>
        Dado da sei con {value} punti — lato di {unit.toFixed(0)}px
      </desc>
    </motion.svg>
  )
}
