/**
 * PRNG deterministico (mulberry32) con stato serializzabile.
 *
 * Perché non `Math.random()`: la partita deve essere riproducibile. Con un seed
 * salvato nello stato, l'intero log è rigiocabile — utile per i test, per il
 * ripristino dopo un refresh della TV e per indagare le segnalazioni di bug.
 */
export interface RngState {
  readonly seed: number
  readonly calls: number
}

export const createRng = (seed: number): RngState => ({ seed: seed >>> 0, calls: 0 })

function mulberry32(a: number): number {
  a = (a + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Avanza lo stato e restituisce un float in [0,1). */
export function next(state: RngState): [number, RngState] {
  const a = (state.seed + state.calls * 0x9e3779b9) >>> 0
  return [mulberry32(a), { seed: state.seed, calls: state.calls + 1 }]
}

/** Intero in [0, max). */
export function nextInt(state: RngState, max: number): [number, RngState] {
  const [v, s] = next(state)
  return [Math.floor(v * max), s]
}

/** Un dado a sei facce. */
export function rollDie(state: RngState): [number, RngState] {
  const [v, s] = nextInt(state, 6)
  return [v + 1, s]
}

/** Fisher-Yates deterministico: non muta l'array in ingresso. */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const out = [...items]
  let s = state
  for (let i = out.length - 1; i > 0; i--) {
    const [j, ns] = nextInt(s, i + 1)
    s = ns
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return [out, s]
}

export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0
