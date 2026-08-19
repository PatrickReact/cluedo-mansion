/**
 * DERIVAZIONE DEI NOMI DEI CANALI REALTIME
 *
 * Il nome del canale deve essere una proprieta della STANZA, mai del
 * dispositivo. Sembra ovvio detto cosi, ed e esattamente l'errore che questo
 * file conteneva:
 *
 *   la versione precedente usava SHA-256 tramite `crypto.subtle` dove
 *   disponibile, e un hash non crittografico altrove. Ma `crypto.subtle` esiste
 *   solo in contesto sicuro — HTTPS o localhost. Nella prova classica in
 *   salotto la TV sta su `localhost:5173` e il telefono su
 *   `http://192.168.x.x:5173`, che contesto sicuro non e. Risultato: i due capi
 *   calcolavano due nomi diversi per la stessa stanza e non si incontravano
 *   mai. Il WebSocket funzionava, l'intento partiva e veniva consegnato — su un
 *   canale dove non ascoltava nessuno. Nessun errore, nessun messaggio: il
 *   pulsante "Entra" sembrava semplicemente rotto.
 *
 * Da qui la regola: **un solo algoritmo, sempre, ovunque**. Niente rami
 * condizionali, niente capacita del dispositivo, niente `await`.
 *
 * PERCHE UN HASH NON CRITTOGRAFICO VA BENISSIMO QUI.
 * Il codice stanza ha sei caratteri su un alfabeto di 28: circa 2^29
 * combinazioni. A quella entropia nessun hash e "difficile da invertire" —
 * enumerarle tutte e precalcolare i nomi dei canali e alla portata di chiunque,
 * con SHA-256 esattamente come con FNV-1a. La segretezza non viene dall'hash:
 * viene dal fatto che il codice si vede solo sullo schermo della TV. L'hash
 * serve a un'altra cosa, piu modesta e piu utile: che il codice non viaggi in
 * chiaro sul filo e che i nomi dei canali non collidano.
 *
 * Sostituirlo con SHA-256 puro in JavaScript sarebbe possibile e resterebbe
 * coerente, ma non aggiungerebbe nulla di reale contro un attacco a forza bruta
 * su 2^29: costerebbe codice per una sicurezza illusoria.
 */

/**
 * FNV-1a a 128 bit, ottenuto da quattro corse indipendenti con semi diversi.
 *
 * Deterministico, senza dipendenze, identico in ogni browser e in Node — che e
 * l'unica proprieta che conta per un nome di canale.
 */
function hash128(input: string): string {
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

/**
 * Canale pubblico della stanza: stato di gioco e intenti dei giocatori.
 * Sincrono di proposito — un `await` in piu sul percorso di connessione e un
 * punto in piu in cui l'ingresso puo restare appeso.
 */
export function publicChannelName(roomCode: string): string {
  return `cl-pub-${hash128(`cluedo:public:${roomCode.toUpperCase()}`).slice(0, 16)}`
}

/**
 * Canale privato di un singolo giocatore: la sua mano e le carte che vede.
 * Deriva dal codice stanza piu l'id del giocatore, quindi solo l'host e quel
 * telefono possono calcolarlo.
 */
export function privateChannelName(roomCode: string, playerId: string): string {
  return `cl-prv-${hash128(`cluedo:private:${roomCode.toUpperCase()}:${playerId}`).slice(0, 20)}`
}
