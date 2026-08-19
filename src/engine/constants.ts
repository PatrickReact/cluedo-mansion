/**
 * Dati canonici del Cluedo classico (Tudor Mansion, 6 sospetti / 6 armi / 9 stanze).
 *
 * Nessun `enum`: il progetto compila con `erasableSyntaxOnly`, quindi le
 * enumerazioni sono oggetti `as const` + union type derivate.
 */

export const SUSPECTS = [
  {
    id: 'scarlett',
    name: 'Miss Scarlett',
    shortName: 'Scarlett',
    color: '#e0364f',
    colorDark: '#8c1428',
    ink: '#ffffff',
    bio: 'Ambiziosa e affascinante, sa sempre a chi chiedere il favore giusto.',
  },
  {
    id: 'mustard',
    name: 'Colonnello Mustard',
    shortName: 'Mustard',
    color: '#e3a72c',
    colorDark: '#8f6208',
    ink: '#241a00',
    bio: 'Militare in pensione, orgoglioso delle sue medaglie e dei suoi silenzi.',
  },
  {
    id: 'white',
    name: 'Mrs. White',
    shortName: 'White',
    color: '#e8e6e1',
    colorDark: '#9a978f',
    ink: '#1a1a1a',
    bio: 'Governante della magione da trent’anni. Conosce ogni porta e ogni segreto.',
  },
  {
    id: 'green',
    name: 'Reverendo Green',
    shortName: 'Green',
    color: '#2fa15c',
    colorDark: '#0d5c32',
    ink: '#ffffff',
    bio: 'Uomo di fede dal passato nebuloso e dalle finanze ancora più nebulose.',
  },
  {
    id: 'peacock',
    name: 'Mrs. Peacock',
    shortName: 'Peacock',
    color: '#3672d1',
    colorDark: '#173e7d',
    ink: '#ffffff',
    bio: 'Vedova altolocata, collezionista di gioielli e di rancori.',
  },
  {
    id: 'plum',
    name: 'Professor Plum',
    shortName: 'Plum',
    color: '#8b4fd0',
    colorDark: '#4a2178',
    ink: '#ffffff',
    bio: 'Accademico brillante, sospeso dall’università per ragioni mai chiarite.',
  },
] as const

export const WEAPONS = [
  { id: 'candlestick', name: 'Candeliere', classicRoom: 'dining' },
  { id: 'dagger', name: 'Pugnale', classicRoom: 'lounge' },
  { id: 'lead_pipe', name: 'Tubo di piombo', classicRoom: 'conservatory' },
  { id: 'revolver', name: 'Rivoltella', classicRoom: 'study' },
  { id: 'rope', name: 'Corda', classicRoom: 'ballroom' },
  { id: 'wrench', name: 'Chiave inglese', classicRoom: 'kitchen' },
] as const

export const ROOMS = [
  { id: 'kitchen', name: 'Cucina', glyph: 'K', secretPassageTo: 'study' },
  { id: 'ballroom', name: 'Sala da ballo', glyph: 'B', secretPassageTo: null },
  { id: 'conservatory', name: 'Serra', glyph: 'C', secretPassageTo: 'lounge' },
  { id: 'dining', name: 'Sala da pranzo', glyph: 'D', secretPassageTo: null },
  { id: 'billiard', name: 'Sala biliardo', glyph: 'I', secretPassageTo: null },
  { id: 'library', name: 'Biblioteca', glyph: 'L', secretPassageTo: null },
  { id: 'lounge', name: 'Salotto', glyph: 'O', secretPassageTo: 'conservatory' },
  { id: 'hall', name: 'Ingresso', glyph: 'H', secretPassageTo: null },
  { id: 'study', name: 'Studio', glyph: 'S', secretPassageTo: 'kitchen' },
] as const

/** La cantina centrale: contiene la busta della soluzione, inaccessibile ai giocatori. */
export const CELLAR_GLYPH = 'X'

export type SuspectId = (typeof SUSPECTS)[number]['id']
export type WeaponId = (typeof WEAPONS)[number]['id']
export type RoomId = (typeof ROOMS)[number]['id']

export const SUSPECT_IDS = SUSPECTS.map((s) => s.id) as readonly SuspectId[]
export const WEAPON_IDS = WEAPONS.map((w) => w.id) as readonly WeaponId[]
export const ROOM_IDS = ROOMS.map((r) => r.id) as readonly RoomId[]

export const SUSPECT_BY_ID = Object.fromEntries(SUSPECTS.map((s) => [s.id, s])) as Record<
  SuspectId,
  (typeof SUSPECTS)[number]
>
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<
  WeaponId,
  (typeof WEAPONS)[number]
>
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<
  RoomId,
  (typeof ROOMS)[number]
>

export const isSuspectId = (v: string): v is SuspectId => SUSPECT_IDS.includes(v as SuspectId)
export const isWeaponId = (v: string): v is WeaponId => WEAPON_IDS.includes(v as WeaponId)
export const isRoomId = (v: string): v is RoomId => ROOM_IDS.includes(v as RoomId)
