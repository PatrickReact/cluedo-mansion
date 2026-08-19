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
