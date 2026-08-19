import { ROOM_IDS, SUSPECT_IDS, WEAPON_IDS, ROOM_BY_ID, SUSPECT_BY_ID, WEAPON_BY_ID } from './constants'
import type { RoomId, SuspectId, WeaponId } from './constants'
import type { Card, CardKey, Solution } from './types'

export const cardKey = (card: Card): CardKey => `${card.type}:${card.id}` as CardKey
export const suspectCard = (id: SuspectId): CardKey => `suspect:${id}`
export const weaponCard = (id: WeaponId): CardKey => `weapon:${id}`
export const roomCard = (id: RoomId): CardKey => `room:${id}`

export function parseCard(key: CardKey): Card {
  const [type, id] = key.split(':') as [Card['type'], string]
  return { type, id } as Card
}

/** Il mazzo completo: 21 carte. */
export const FULL_DECK: readonly CardKey[] = [
  ...SUSPECT_IDS.map(suspectCard),
  ...WEAPON_IDS.map(weaponCard),
  ...ROOM_IDS.map(roomCard),
]

export function cardLabel(key: CardKey): string {
  const card = parseCard(key)
  switch (card.type) {
    case 'suspect':
      return SUSPECT_BY_ID[card.id].name
    case 'weapon':
      return WEAPON_BY_ID[card.id].name
    case 'room':
      return ROOM_BY_ID[card.id].name
  }
}

/** Le tre carte nominate da un'ipotesi/accusa. */
export const solutionCards = (s: Solution): readonly CardKey[] => [
  suspectCard(s.suspect),
  weaponCard(s.weapon),
  roomCard(s.room),
]

/** Carte della mano che possono confutare l'ipotesi. */
export function matchingCards(hand: readonly CardKey[], suggestion: Solution): CardKey[] {
  const named = new Set<string>(solutionCards(suggestion))
  return hand.filter((c) => named.has(c))
}
