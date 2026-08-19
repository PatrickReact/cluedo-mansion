import { customAlphabet } from 'nanoid'

/**
 * Alfabeto senza caratteri ambigui: niente 0/O, 1/I/L, 5/S, 8/B.
 * Il codice va letto da uno schermo dall'altra parte della stanza e digitato
 * su un telefono, quindi la leggibilita conta piu dell'entropia massima.
 */
const ALPHABET = '23467９ACDEFGHJKMNPQRTUVWXYZ'.replace('９', '9')

/** ~28^6 = 4.8e8 combinazioni: piu che sufficienti per partite simultanee. */
export const newRoomCode = customAlphabet(ALPHABET, 6)

/** Id giocatore: opaco, stabile fra i ricaricamenti, salvato in localStorage. */
export const newPlayerId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12)

export const normalizeRoomCode = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 6)

export const isValidRoomCode = (raw: string): boolean => normalizeRoomCode(raw).length === 6
