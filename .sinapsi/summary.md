# Summary

<!-- sinapsi:start v0.3.1 — kept current automatically by Sinapsi — refreshed on every build and by the watcher whenever files or folders are created, moved or deleted. No command to run; edits between these markers are replaced -->
```
# ranked map, not a listing: the largest, most-connected and most-recently-touched code,
# the 3 newest docs, and anything new. Dates are last-modified.
.github/ … 2 files, none ranked
practices/
  hidden-information.md                       2026-08-19
  realtime-sessions.md                        2026-08-19
  … 4 more, none ranked
public/ … 32 files, none ranked
scripts/gen-assets.mjs                        2026-08-19
src/
  bots/
    bots.test.ts                              2026-08-19  edited this session
    policy.ts                                 2026-08-19  edited this session
  data/ … 0 files, none ranked
  engine/
    board/
      board.ts                                2026-08-19
    engine.test.ts                            2026-08-19  edited this session
    reducer.ts                                2026-08-19  edited this session
  hooks/ … 2 files, none ranked
  lib/ … 4 files, none ranked
  net/ … 6 files, none ranked
  routes/
    phone/
      ActionPanel.tsx                         2026-08-19  edited this session
      Notebook.tsx                            2026-08-19  edited this session
      PhoneJoin.tsx                           2026-08-19  edited this session
    tv/
      TvSidebar.tsx                           2026-08-19  edited this session
  store/
    hostStore.ts                              2026-08-19  edited this session
    playerStore.ts                            2026-08-19  edited this session
  test/ … 0 files, none ranked
  ui/ … 3 files, none ranked
  … 4 more, none ranked
.prettierignore                               2026-08-19  edited this session
README.md                                     2026-08-19  edited this session
package-lock.json                             2026-08-19
vitest.config.ts                              2026-08-19  edited this session
… 14 more, none ranked
# 18 of 109 files are on this map — the rest are unranked, not hidden.
```
<!-- sinapsi:end -->

The project's state in one document: the work-tree map above (Sinapsi's, refreshed on every
build), the last patches at a glance, and a short recap.

**Sinapsi writes this file — you do not.** The opening tool of a patch returns it, and the
closing tool updates it: a dated line in, the eleventh out, and the recap replaced.

## Recent sessions

<!-- The last 10 patches, newest first: `- <timestamp> — <one line>`. The window slides
     on its own; the full history is in the session log and, once rotated, in archive/. -->

- 2026-08-19T20:30 — Avversari automatici probabilistici, onesti per costruzione e livellabili
- 2026-08-19T19:16 — Impianto completo del Cluedo multiplayer: motore puro, rete host-autoritativa, TV e telefono

## Where things stand

Cluedo multiplayer per il salotto: la TV e tabellone e host autoritativo, i
telefoni mandano solo intenti. Motore delle regole in TypeScript puro, tabellone
come mappa ASCII 24x25, segretezza delle carte garantita dal payload
(`toPublicState`) e non dalla UI. Dalla lobby si riempiono i posti liberi con
avversari automatici probabilistici — deduzione esatta piu campionamento di
mondi coerenti, scelta per guadagno di informazione, tre livelli che cambiano la
profondita di analisi e mai cio che il bot vede. 81 test verdi, codice su
`main` e deploy Vercel attivo; manca solo la configurazione Supabase, senza la
quale i telefoni non si collegano.
