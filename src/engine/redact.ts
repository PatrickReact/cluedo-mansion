import type { CardKey, GameState, LogEntry, Player } from './types'

/**
 * REDAZIONE DELLO STATO — il pezzo che tiene onesto il gioco.
 *
 * La TV e appesa al muro: chiunque la guarda vede tutto quello che vi
 * compare. Quindi lo stato che l'host trasmette in chiaro sul canale pubblico
 * non deve MAI contenere ne la soluzione ne le mani dei giocatori.
 *
 * Ogni telefono riceve in piu, su un canale privato dedicato, solo la propria
 * vista: la sua mano e le righe di log a lui destinate.
 */

/** Vista pubblica: quella che finisce sulla TV e sul canale broadcast. */
export interface PublicState extends Omit<GameState, 'players' | 'solution' | 'rng'> {
  readonly players: readonly PublicPlayer[]
  /** Rivelata solo a fine partita. */
  readonly solution: GameState['solution']
}

export interface PublicPlayer extends Omit<Player, 'hand'> {
  /** Quante carte ha in mano: e informazione pubblica al tavolo. */
  readonly handCount: number
}

/** Vista privata di un singolo giocatore. */
export interface PrivateState {
  readonly playerId: string
  readonly hand: readonly CardKey[]
  /** Righe di log destinate a questo giocatore (es. la carta mostrata). */
  readonly privateLog: readonly LogEntry[]
  /**
   * La carta appena mostrata a questo giocatore, se e lui ad aver ipotizzato,
   * insieme a chi gliel'ha mostrata. Sta fuori dallo stato pubblico: la TV non
   * deve mai vederla. Il telefono la accumula nel proprio taccuino.
   */
  readonly reveal: { readonly card: CardKey; readonly fromPlayerId: string } | null
  /** Carte che il giocatore deve scegliere per confutare. */
  readonly mustShowFrom: readonly CardKey[]
}

const publicLog = (log: readonly LogEntry[]): LogEntry[] =>
  log.map((entry) => (entry.privateText ? { ...entry, privateText: undefined, privateTo: undefined } : entry))

/** Rimuove mani, soluzione e righe private. Sicuro da mostrare a chiunque. */
export function toPublicState(state: GameState): PublicState {
  const gameOver = state.phase.kind === 'game_over'
  const { players, solution, rng, log, phase, ...rest } = state
  void rng

  // Nella fase di risultato ipotesi la carta mostrata e privata: va tolta.
  const safePhase = phase.kind === 'suggestion_result' ? { ...phase, shownCard: null } : phase

  return {
    ...rest,
    phase: safePhase,
    log: publicLog(log),
    solution: gameOver ? solution : null,
    players: players.map(({ hand, ...p }) => ({ ...p, handCount: hand.length })),
  }
}

/** Costruisce la vista privata destinata a un singolo giocatore. */
export function toPrivateState(state: GameState, playerId: string): PrivateState {
  const player = state.players.find((p) => p.id === playerId)
  const hand = player?.hand ?? []

  const privateLog = state.log.filter((e) => e.privateTo?.includes(playerId))

  const reveal =
    state.phase.kind === 'suggestion_result' &&
    state.phase.suggesterId === playerId &&
    state.phase.shownCard &&
    state.phase.disprovedBy
      ? { card: state.phase.shownCard, fromPlayerId: state.phase.disprovedBy }
      : null

  const mustShowFrom =
    state.phase.kind === 'resolving_suggestion' && state.phase.awaitingFrom === playerId
      ? matchingFromHand(hand, state)
      : []

  return { playerId, hand, privateLog, reveal, mustShowFrom }
}

function matchingFromHand(hand: readonly CardKey[], state: GameState): CardKey[] {
  if (state.phase.kind !== 'resolving_suggestion') return []
  const s = state.phase.suggestion
  const named = new Set<string>([`suspect:${s.suspect}`, `weapon:${s.weapon}`, `room:${s.room}`])
  return hand.filter((c) => named.has(c))
}
