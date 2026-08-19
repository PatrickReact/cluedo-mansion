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
  data/ … 0 files, none ranked
  engine/
    board/
      board.ts                                2026-08-19
    constants.ts                              2026-08-19
    engine.test.ts                            2026-08-19
    reducer.ts                                2026-08-19
  hooks/
    useShake.ts                               2026-08-19
  lib/ … 4 files, none ranked
  net/ … 6 files, none ranked
  routes/phone/
    ActionPanel.tsx                           2026-08-19
  store/
    hostStore.ts                              2026-08-19
    playerStore.ts                            2026-08-19
  test/ … 0 files, none ranked
  ui/
    Board.tsx                                 2026-08-19
    Loading.tsx                               2026-08-19
  main.tsx                                    2026-08-19
  … 3 more, none ranked
.oxlintrc.json                                2026-08-19
README.md                                     2026-08-19
package-lock.json                             2026-08-19
… 14 more, none ranked
# 17 of 104 files are on this map — the rest are unranked, not hidden.
```
<!-- sinapsi:end -->

The project's state in one document: the work-tree map above (Sinapsi's, refreshed on every
build), the last patches at a glance, and a short recap.

**Sinapsi writes this file — you do not.** The opening tool of a patch returns it, and the
closing tool updates it: a dated line in, the eleventh out, and the recap replaced.

## Recent sessions

<!-- The last 10 patches, newest first: `- <timestamp> — <one line>`. The window slides
     on its own; the full history is in the session log and, once rotated, in archive/. -->

- 2026-08-19T19:16 — Impianto completo del Cluedo multiplayer: motore puro, rete host-autoritativa, TV e telefono

## Where things stand

Cluedo multiplayer per il salotto: la TV mostra il tabellone e fa da host
autoritativo, i telefoni sono controller che mandano solo intenti. Il motore
delle regole e TypeScript puro con 62 test; il tabellone e una mappa ASCII 24x25
da cui derivano pathfinding, rendering e validazione. La segretezza delle carte
e una proprieta del payload (`toPublicState`), non della UI, ed e verificata da
un test. Il codice e completo e verde in locale su `D:\Games\Cluedo` (branch
`main`), ma non ancora pubblicato: mancano remote GitHub, progetto Vercel e
credenziali Supabase — e finche manca Supabase i telefoni non si collegano.
