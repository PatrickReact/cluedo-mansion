# Session log

Operational changelog: one entry per patch, as an **excursus of 20-30 lines** — goal, what
changed, what was verified with which command, what is open. Chronological, append-only,
never rewritten. The eloquent current state lives in the handoff and the overall in the
summary; an entry is the story of one patch, not a document about the project.

**Sinapsi writes this file — you do not.** Entries are appended by the closing tool of a
patch; past its line or token budget the whole log moves to `archive/` and a fresh one
starts holding the most recent entries, which then slide out one per new patch. That
overlap is deliberate: the next session opens mid-thread instead of on a cut. Editing this
file by hand breaks the slide, and the guard hook refuses it.

<!-- The first close writes the first entry. -->

<!-- sinapsi:entry 2026-08-19T19:16 -->
## 2026-08-19T19:16 — Impianto completo del Cluedo multiplayer: motore puro, rete host-autoritativa, TV e telefono

Obiettivo: creare da zero l'architettura di un Cluedo giocabile via web, con la
mappa sulla TV e i telefoni come controller, deployabile su Vercel.

Ricerca preliminare sulle regole (Hasbro, Asmodee, cluedofan, gamerules) per fissare
i casi limite che di solito si sbagliano: entrare in stanza termina il movimento e il
resto del tiro si perde, divieto di rientrare nella stanza lasciata nello stesso
turno, confutazione oraria con UNA sola carta, accusa unica che elimina dai turni ma
non dalla confutazione.

Cosa e stato creato:
- src/engine/: regole in TypeScript puro, zero React. Tabellone come mappa ASCII
  24x25 in board/map.ts (unica fonte di verita), pathfinding BFS, RNG con seed nello
  stato, reducer immutabile via immer, notes.ts con deduzione a punto fisso,
  redact.ts come unico confine fra pubblico e privato.
- src/net/: Transport dietro interfaccia, LocalTransport (BroadcastChannel) e
  SupabaseTransport. I nomi dei canali sono hash del codice stanza, che resta solo
  sulla TV e nel fragment del QR.
- src/routes/tv e src/routes/phone, src/ui/Board.tsx (SVG derivato dalla mappa).
- scripts/gen-assets.mjs: 32 SVG originali + PNG PWA con encoder minimale.

Verifica: `npm run check` verde (oxlint, 62 test, build). Un test d'integrazione in
ambiente Node fa girare host e client su BroadcastChannel e asserisce che nessuna
carta compaia sul canale pubblico. Flusso completo guidato in Chrome: lobby, 3
telefoni che entrano dal QR, avvio, tiro dadi, movimento — zero errori console.

Aperto: nessun remote GitHub, nessun progetto Vercel, nessuna credenziale Supabase,
quindi i telefoni non possono ancora connettersi davvero.

<!-- sinapsi:entry 2026-08-19T20:30 -->
## 2026-08-19T20:30 — Avversari automatici probabilistici, onesti per costruzione e livellabili

Obiettivo: permettere di giocare in due o da soli senza toccare il minimo di
tre giocatori del regolamento. Quindi bot che occupano posti veri: tengono
carte, confutano, possono vincere.

Vincoli posti da Patrick: nessuno sbirciamento, tutto algoritmico e
deterministico (niente modelli addestrati), livelli di difficolta, fedelta al
regolamento originale.

Cosa e stato creato in `src/bots/`:
- belief.ts — deduzione esatta riusando `computeNotes` (lo stesso solver del
  taccuino umano), piu campionamento di migliaia di distribuzioni delle carte
  compatibili con quanto osservato. Contarle esattamente e #P-difficile.
- policy.ts — scelta dell'ipotesi per massimo guadagno di informazione atteso
  sulla distribuzione della soluzione; movimento verso le stanze la cui carta
  e ancora ignota; confutazione che rimostra una carta gia vista.
- driver.ts — passa a `decide()` SOLO `toPublicState` e `toPrivateState`.

Refactor abilitanti: rimosso `isNpc`, un gancio mai agganciato, e i 17 filtri
che lo escludevano; `computeNotes` non prende piu un `GameState` ma il minimo
che gli serve, il che ha eliminato anche il cast forzato lato telefono.

Due difetti trovati misurando, non leggendo il codice:
1. I bot rimbalzavano fra le coppie di passaggi segreti all'infinito
   (Cucina<->Studio), ripetendo la stessa ipotesi 24 volte. Il passaggio va
   confrontato con la migliore stanza del tabellone, non con quella attuale.
2. Entrare sempre nella stanza raggiungibile piu vicina impedisce di testare
   le carte stanza lontane: le partite non finivano in 160 turni.
Corretti entrambi, le partite si chiudono 5/5.

Verificato: 81 test (`npm run check` verde), benchmark su 5 seed a parita di
carte e dadi — facile 47.8 turni, medio 37.4, difficile 28.2, zero accuse
errate a ogni livello. Prova nel browser reale: lobby, due bot aggiunti dalla
TV, livelli ciclati, partita avviata, bot che giocano da soli e si confutano.

Chiuso anche il fallimento della CI: `prettier --check` controllava i file di
`.sinapsi/`, ora esclusi. Push su main fatto, deploy Vercel in produzione.
