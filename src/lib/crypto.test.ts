// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { privateChannelName, publicChannelName } from './crypto'

/**
 * IL NOME DEL CANALE E UNA PROPRIETA DELLA STANZA, NON DEL DISPOSITIVO.
 *
 * Questo file esiste per un bug preciso, costato una serata: la derivazione
 * usava SHA-256 dove `crypto.subtle` era disponibile e un hash diverso altrove.
 * `crypto.subtle` esiste solo in contesto sicuro, quindi la TV su `localhost` e
 * il telefono su `http://192.168.x.x` finivano su due canali diversi e non si
 * incontravano mai — senza un solo messaggio d'errore, perche tecnicamente
 * andava tutto bene: l'intento partiva e nessuno lo ascoltava.
 *
 * I test qui sotto rendono impossibile reintrodurlo.
 */

const originalCrypto = globalThis.crypto

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: originalCrypto,
    configurable: true,
    writable: true,
  })
})

/** Simula un contesto NON sicuro, dove `crypto.subtle` non esiste. */
function withoutSubtle<T>(fn: () => T): T {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...originalCrypto, subtle: undefined },
    configurable: true,
    writable: true,
  })
  return fn()
}

describe('nomi dei canali realtime', () => {
  it('non dipendono dalla disponibilita di crypto.subtle', () => {
    const sicuro = publicChannelName('ABC123')
    const nonSicuro = withoutSubtle(() => publicChannelName('ABC123'))
    expect(nonSicuro, 'TV e telefono devono calcolare lo stesso canale').toBe(sicuro)
  })

  it('vale anche per i canali privati', () => {
    const sicuro = privateChannelName('ABC123', 'giocatore-1')
    const nonSicuro = withoutSubtle(() => privateChannelName('ABC123', 'giocatore-1'))
    expect(nonSicuro).toBe(sicuro)
  })

  it('sono sincroni: nessun await sul percorso di connessione', () => {
    // Se un giorno tornassero asincroni, questo test fallisce prima che il
    // pulsante "Entra" possa restare appeso in produzione.
    expect(typeof publicChannelName('ABC123')).toBe('string')
    expect(typeof privateChannelName('ABC123', 'x')).toBe('string')
  })

  it('sono stabili e insensibili alle maiuscole del codice', () => {
    expect(publicChannelName('abc123')).toBe(publicChannelName('ABC123'))
    expect(publicChannelName('ABC123')).toBe(publicChannelName('ABC123'))
  })

  it('stanze diverse non collidono', () => {
    const nomi = new Set<string>()
    for (let i = 0; i < 2000; i++) nomi.add(publicChannelName(`R${i.toString(36).padStart(5, '0')}`))
    expect(nomi.size).toBe(2000)
  })

  it('giocatori diversi nella stessa stanza hanno canali distinti', () => {
    const a = privateChannelName('ABC123', 'ada')
    const b = privateChannelName('ABC123', 'bruno')
    expect(a).not.toBe(b)
    // E il canale privato non deve mai coincidere con quello pubblico.
    expect(a).not.toBe(publicChannelName('ABC123'))
  })

  it('il codice stanza non compare in chiaro nel nome del canale', () => {
    const nome = publicChannelName('ZXQ742')
    expect(nome).not.toContain('ZXQ742')
    expect(nome).not.toContain('zxq742')
  })
})
