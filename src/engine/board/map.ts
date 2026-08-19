import type { RoomId, SuspectId } from '../constants'

/**
 * IL TABELLONE — unica fonte di verità, in ASCII.
 *
 * Griglia 24 colonne x 25 righe, l'origine (0,0) è in alto a sinistra.
 * Modificare questa stringa modifica il gioco: parser, pathfinding, rendering
 * SVG e validazione delle mosse derivano tutti da qui.
 *
 *   `.` corridoio percorribile
 *   `#` vuoto / fuori dalla magione (non percorribile)
 *   `X` cantina centrale — contiene la busta, inaccessibile
 *   lettera  casella di stanza (vedi `glyph` in ROOMS)
 *
 * Topologia fedele al tabellone classico: 9 stanze sul perimetro, cantina al
 * centro, 17 porte e i due passaggi segreti fra angoli opposti
 * (Cucina<->Studio, Serra<->Salotto). Le coordinate esatte delle caselle sono
 * una ricostruzione: Hasbro non pubblica una griglia ufficiale. Sono state
 * scelte per preservare proporzioni, numero di porte e distanze di gioco.
 */
export const BOARD_MAP: readonly string[] = [
  'KKKKKK............CCCCCC', // 0
  'KKKKKK..BBBBBBBB..CCCCCC', // 1
  'KKKKKK..BBBBBBBB..CCCCCC', // 2
  'KKKKKK..BBBBBBBB..CCCCCC', // 3
  'KKKKKK..BBBBBBBB..CCCCCC', // 4
  'KKKKKK..BBBBBBBB........', // 5
  '........BBBBBBBB........', // 6
  '........BBBBBBBB........', // 7
  '..................IIIIII', // 8
  'DDDDDDDD..........IIIIII', // 9
  'DDDDDDDD..XXXXX...IIIIII', // 10
  'DDDDDDDD..XXXXX...IIIIII', // 11
  'DDDDDDDD..XXXXX...IIIIII', // 12
  'DDDDDDDD..XXXXX.........', // 13
  'DDDDDDDD..XXXXX..LLLLLLL', // 14
  '..........XXXXX..LLLLLLL', // 15
  '..........XXXXX..LLLLLLL', // 16
  '.................LLLLLLL', // 17
  '.........HHHHHH..LLLLLLL', // 18
  'OOOOOOO..HHHHHH.........', // 19
  'OOOOOOO..HHHHHH.........', // 20
  'OOOOOOO..HHHHHH..SSSSSSS', // 21
  'OOOOOOO..HHHHHH..SSSSSSS', // 22
  'OOOOOOO..HHHHHH..SSSSSSS', // 23
  'OOOOOOO..HHHHHH..SSSSSSS', // 24
] as const

export const BOARD_WIDTH = 24
export const BOARD_HEIGHT = 25

export interface Coord {
  readonly c: number
  readonly r: number
}

/**
 * Una porta collega UNA casella di corridoio a UNA stanza.
 * Entrare consuma un passo e termina il movimento; uscire deposita la pedina
 * sulla casella `corridor`.
 */
export interface Door {
  readonly room: RoomId
  /** Casella di corridoio immediatamente fuori dalla porta. */
  readonly corridor: Coord
  /** Casella di stanza sulla soglia — usata solo per disegnare la porta. */
  readonly threshold: Coord
}

/** 17 porte, come sul tabellone classico. */
export const DOORS: readonly Door[] = [
  // Cucina — 1 porta (a sud)
  { room: 'kitchen', threshold: { c: 4, r: 5 }, corridor: { c: 4, r: 6 } },

  // Sala da ballo — 4 porte
  { room: 'ballroom', threshold: { c: 8, r: 4 }, corridor: { c: 7, r: 4 } },
  { room: 'ballroom', threshold: { c: 15, r: 4 }, corridor: { c: 16, r: 4 } },
  { room: 'ballroom', threshold: { c: 9, r: 7 }, corridor: { c: 9, r: 8 } },
  { room: 'ballroom', threshold: { c: 14, r: 7 }, corridor: { c: 14, r: 8 } },

  // Serra — 1 porta
  { room: 'conservatory', threshold: { c: 19, r: 4 }, corridor: { c: 19, r: 5 } },

  // Sala da pranzo — 2 porte
  { room: 'dining', threshold: { c: 6, r: 9 }, corridor: { c: 6, r: 8 } },
  { room: 'dining', threshold: { c: 7, r: 12 }, corridor: { c: 8, r: 12 } },

  // Sala biliardo — 2 porte
  { room: 'billiard', threshold: { c: 18, r: 9 }, corridor: { c: 17, r: 9 } },
  { room: 'billiard', threshold: { c: 22, r: 12 }, corridor: { c: 22, r: 13 } },

  // Biblioteca — 2 porte
  { room: 'library', threshold: { c: 20, r: 14 }, corridor: { c: 20, r: 13 } },
  { room: 'library', threshold: { c: 17, r: 16 }, corridor: { c: 16, r: 16 } },

  // Salotto — 1 porta
  { room: 'lounge', threshold: { c: 6, r: 19 }, corridor: { c: 7, r: 19 } },

  // Ingresso — 3 porte
  { room: 'hall', threshold: { c: 11, r: 18 }, corridor: { c: 11, r: 17 } },
  { room: 'hall', threshold: { c: 12, r: 18 }, corridor: { c: 12, r: 17 } },
  { room: 'hall', threshold: { c: 14, r: 20 }, corridor: { c: 15, r: 20 } },

  // Studio — 1 porta
  { room: 'study', threshold: { c: 17, r: 21 }, corridor: { c: 16, r: 21 } },
] as const

/**
 * Caselle di partenza, distribuite sul perimetro.
 * Distanza minima da una stanza: Peacock 4, Scarlett/White/Green 5, Plum 6,
 * Mustard 7 — Mrs. Peacock resta la più vicina, come sul tabellone originale.
 */
export const START_POSITIONS: Readonly<Record<SuspectId, Coord>> = {
  scarlett: { c: 16, r: 0 },
  white: { c: 7, r: 0 },
  green: { c: 0, r: 6 },
  mustard: { c: 23, r: 7 },
  plum: { c: 7, r: 24 },
  peacock: { c: 16, r: 24 },
} as const

/** Ordine di turno canonico, in senso orario dalla casella di Miss Scarlett. */
export const TURN_ORDER: readonly SuspectId[] = [
  'scarlett',
  'mustard',
  'white',
  'green',
  'peacock',
  'plum',
] as const
