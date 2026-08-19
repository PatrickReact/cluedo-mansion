/**
 * Derivazione dei nomi dei canali realtime.
 *
 * Modello di fiducia: chi vede la TV puo giocare. Il codice stanza e mostrato
 * solo sullo schermo grande (e nel QR), non viaggia mai in chiaro: sul filo
 * passano solo i suoi derivati. Chi non e nella stanza non conosce il codice,
 * quindi non sa nemmeno su quale canale mettersi in ascolto.
 *
 * Nota sul contesto sicuro: `crypto.subtle` esiste solo su HTTPS e localhost.
 * Provando dal telefono su http://192.168.x.x non c'e, quindi esiste un
 * ripiego non crittografico. I nomi dei canali restano validi e la partita
 * funziona; si perde solo l'irreversibilita dell'hash, irrilevante in LAN.
 */

const encoder = new TextEncoder()

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const hasSubtle = (): boolean =>
  typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined'

/** FNV-1a a 128 bit (quattro corse indipendenti). Solo come ripiego. */
function fallbackHash(input: string): string {
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
  return seeds
    .map((seed) => {
      let h = seed >>> 0
      for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
      }
      return h.toString(16).padStart(8, '0')
    })
    .join('')
}

async function digest(input: string): Promise<string> {
  if (!hasSubtle()) return fallbackHash(input)
  try {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(input))
    return toHex(buf)
  } catch {
    return fallbackHash(input)
  }
}

/** Canale pubblico della stanza: stato di gioco e intenti dei giocatori. */
export async function publicChannelName(roomCode: string): Promise<string> {
  const h = await digest(`cluedo:public:${roomCode.toUpperCase()}`)
  return `cl-pub-${h.slice(0, 16)}`
}

/**
 * Canale privato di un singolo giocatore: la sua mano e le carte che vede.
 * Deriva dal codice stanza piu l'id del giocatore, quindi solo l'host e quel
 * telefono possono calcolarlo.
 */
export async function privateChannelName(roomCode: string, playerId: string): Promise<string> {
  const h = await digest(`cluedo:private:${roomCode.toUpperCase()}:${playerId}`)
  return `cl-prv-${h.slice(0, 20)}`
}

/** true se il contesto e sicuro e l'hash usato e crittografico. */
export const isSecureHash = (): boolean => hasSubtle()
