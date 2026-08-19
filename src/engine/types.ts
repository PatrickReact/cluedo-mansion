import type { RoomId, SuspectId, WeaponId } from './constants'
import type { Coord, Position } from './board'
import type { RngState } from './rng'

/** Una carta del mazzo: 6 sospetti + 6 armi + 9 stanze = 21. */
export type Card =
  | { readonly type: 'suspect'; readonly id: SuspectId }
  | { readonly type: 'weapon'; readonly id: WeaponId }
  | { readonly type: 'room'; readonly id: RoomId }

/** Identificatore serializzabile di una carta, es. "suspect:plum". */
export type CardKey = `suspect:${SuspectId}` | `weapon:${WeaponId}` | `room:${RoomId}`

export interface Solution {
  readonly suspect: SuspectId
  readonly weapon: WeaponId
  readonly room: RoomId
}

/** Un'ipotesi ha sempre la stanza in cui si trova chi la formula. */
export type Suggestion = Solution
export type Accusation = Solution

export interface Player {
  readonly id: string
  readonly name: string
  readonly suspect: SuspectId
  /** true per i personaggi non assegnati a nessuno (restano sul tabellone). */
  readonly isNpc: boolean
  readonly connected: boolean
  /** Fuori dai turni dopo un'accusa errata, ma continua a confutare. */
  readonly eliminated: boolean
  readonly hasAccused: boolean
  readonly hand: readonly CardKey[]
}

export type Phase =
  /** Lobby: i giocatori si uniscono dal telefono. */
  | { readonly kind: 'lobby' }
  /** Inizio turno: si può tirare, usare un passaggio segreto o accusare. */
  | { readonly kind: 'awaiting_roll' }
  /** Dadi tirati: si sceglie la destinazione. */
  | { readonly kind: 'moving'; readonly dice: readonly [number, number] }
  /** In stanza: si può ipotizzare, accusare o passare. */
  | { readonly kind: 'in_room'; readonly room: RoomId; readonly canSuggest: boolean }
  /** Ipotesi in corso: si attende la confutazione. */
  | {
      readonly kind: 'resolving_suggestion'
      readonly suggestion: Suggestion
      readonly suggesterId: string
      /** Coda dei giocatori interrogati, in senso orario. */
      readonly queue: readonly string[]
      readonly cursor: number
      /** Il giocatore corrente deve scegliere quale carta mostrare. */
      readonly awaitingFrom: string | null
    }
  /** Esito dell'ipotesi mostrato a tutti prima di proseguire. */
  | {
      readonly kind: 'suggestion_result'
      readonly suggestion: Suggestion
      readonly suggesterId: string
      readonly disprovedBy: string | null
      /** Visibile solo a chi ha ipotizzato. */
      readonly shownCard: CardKey | null
    }
  /** Accusa dichiarata: la busta viene aperta. */
  | { readonly kind: 'accusing'; readonly playerId: string; readonly accusation: Accusation }
  | { readonly kind: 'game_over'; readonly winnerId: string | null; readonly solution: Solution }

export type LogEntry = {
  readonly id: string
  readonly turn: number
  /** Testo pubblico, sicuro da mostrare sulla TV. */
  readonly text: string
  readonly kind: 'move' | 'suggestion' | 'disprove' | 'accusation' | 'system' | 'passage'
  readonly actorId: string | null
  /** Dettagli visibili solo a questi giocatori (mai sulla TV). */
  readonly privateTo?: readonly string[]
  readonly privateText?: string
}

/**
 * Traccia pubblica di un'ipotesi risolta: chi ha ipotizzato, chi ha passato,
 * chi ha confutato. NON contiene quale carta e stata mostrata — quella e
 * informazione privata. E la materia prima del taccuino deduttivo.
 */
export interface SuggestionRecord {
  readonly id: string
  readonly turn: number
  readonly suggesterId: string
  readonly suggestion: Suggestion
  /** Giocatori che hanno dichiarato di non poter confutare, in ordine. */
  readonly passed: readonly string[]
  readonly disprovedBy: string | null
}

export interface GameConfig {
  /** Armi nelle stanze classiche invece che distribuite a caso. */
  readonly classicWeaponPlacement: boolean
  /** Chi viene trascinato in una stanza può ipotizzare senza tirare. */
  readonly suggestionMoveGrantsSuggestion: boolean
  /** Numero di dadi (2 = regolamento classico). */
  readonly diceCount: 1 | 2
  /** Secondi per turno, 0 = nessun limite. */
  readonly turnTimeLimit: number
}

export interface GameState {
  readonly version: number
  readonly roomCode: string
  readonly config: GameConfig
  readonly rng: RngState
  readonly players: readonly Player[]
  /** Indice in `turnOrder`. */
  readonly turnIndex: number
  readonly turnOrder: readonly SuspectId[]
  readonly turnNumber: number
  readonly phase: Phase
  readonly solution: Solution | null
  readonly positions: Readonly<Record<SuspectId, Position>>
  readonly weapons: Readonly<Record<WeaponId, RoomId>>
  /** Stanza lasciata in questo turno: non è possibile rientrarci. */
  readonly leftRoomThisTurn: RoomId | null
  /** Personaggi trascinati in una stanza da un'ipotesi altrui. */
  readonly draggedBySuggestion: readonly SuspectId[]
  readonly log: readonly LogEntry[]
  /** Storico pubblico delle ipotesi, per la deduzione automatica. */
  readonly history: readonly SuggestionRecord[]
  /** Percorso dell'ultima mossa, per l'animazione sulla TV. */
  readonly lastPath: readonly Coord[]
  readonly startedAt: number | null
  readonly updatedAt: number
}
