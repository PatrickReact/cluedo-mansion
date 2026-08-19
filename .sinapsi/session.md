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
