# Sinapsi — operating instructions

How to work _here_. `.sinapsi/` is **Sinapsi's** — the project's memory, served and written
through tools, never opened by path. `practices/` at the repo root is **the team's**, seeded
once and never touched again. Your stack, style and test conventions stay in your own AGENTS.md.

OPERATING MODE — this project replaces the defaults you arrived with, and the replacement is mechanical, not advisory.
· if `start_task`/`get_node`/`query_graph`/… are missing from your tool list, they are not absent — some hosts defer tool loading past a token threshold (Claude Code's tool search: ~10% of context in tool definitions, on by default) and hide them behind a discovery call. Look for that discovery tool and search it for `sinapsi` before reaching for Grep or Read.
· a document — ANY `.md` this memory holds — is READ with `read_doc` and WRITTEN with `write_doc`, both by key. Not `Write`, not `Edit`, not a path: the guard refuses those, and the key survives a rename the path does not.
· a NEW numbered document (an RFC, an ADR) comes from `new_doc`, which allocates the number. You never choose one.
· the patch record is `start_task` first and `end_task` last. The timestamps, the rotation and the archiving are not yours to compute.
· to find code, use the table below BEFORE grep or Read. Those two are what you reach for when no row fits your question — not what you reach for first.

Those six lines replace habits, not preferences. Read the rest once; obey those on every turn.

## Exploring — pick the tool by what you already know

- behaviour only, no name → query_graph (lexical and approximate: read its RELEVANCE line before believing it)
- exact name, where is it → get_node (exact; no ranking, no substitution)
- exact name, what breaks → get_neighbors (exact, ~10x cheaper than query_graph)
- no idea of the shape → graph_stats (once)
- auditing a decision → query_ir / compile_ir / explain_ir (~10x the pack's tokens — never to obtain context)
- outside the graph → search the filesystem, and say so. Sinapsi first is the cheaper move, not a prohibition: confirming a result with grep/rg is never a failure, and what no extractor covers is a search, not a query.

The graph is derived from the source: it lags edits and holds only what its extractors index.
**The filesystem is the authority** — outside `.sinapsi/`, which is served, never opened.

### The four headers — independent claims, none implies another

- `RELEVANCE` — how much of your question the top result explains. `RELEVANCE: weak` means the
  answering symbol may be absent entirely: re-query in the project's vocabulary, then search.
- `COVERAGE` — the token budget only. `complete` is not a claim that the answer is present.
- `STRUCTURE` — `absent` means relationships are unknown, never "no callers".
- `FRESHNESS` — how stale the index may be.

## The tools, one by one — what each is specialized for

THE TOOLS, ONE BY ONE — each is specialized, and the speciality is the reason to reach for it before the filesystem:

- `capabilities` — frontend contract. one evidence-backed matrix is rendered identically by CLI, MCP and README; only S4 can use the public word supported.
- `start_task` — orientation. one call returns the project's state AND the document catalogue with per-document token costs — replacing the N file reads and the directory listing that used to buy less, for more.
- `end_task` — the patch record. you write four fields once; the timestamp, the ordering, the rotation and the summary window are mechanical and identical every time — arithmetic an agent redoes by hand comes out different every time.
- `read_doc` — documents. keys, not paths — `rfc/016` still resolves after any rename; a directory key lists its contents; every answer states its token cost BEFORE you pay it, and a wrong key is refused with the catalogue, never answered with a different document.
- `write_doc` — documents, the other way. the same key that reads a document writes it — and the write is the only one that knows this project's line budget, refuses the three files the rotation owns, and refuses an archived decision instead of quietly editing history.
- `new_doc` — a numbered document. the next free number of a series, allocated across the live files AND the archive, with that series' own template stamped — a number chosen by eye is how two documents came to be `rfc/010` and a supersession went unseen for eleven days.
- `query_graph` — behaviour you cannot name. a token-budgeted pack of signatures, one-line docs and exact file:line ranges that usually answers WITHOUT opening a file — and it carries four verdicts that tell you when not to believe it, which no grep result ever does.
- `get_node` — exact identity. an exact name becomes file, span, signature and doc in one step — the cheapest name-to-location move here, and it refuses rather than guesses, so what it returns is never a near-miss.
- `get_neighbors` — blast radius. compiler-resolved callers, callees and importers of an exact name at ~10x fewer tokens than query_graph — grep shows text that mentions the name; this shows relations a compiler vouched for, with the verdict when none did.
- `graph_stats` — first contact. the shape of an unknown codebase — counts, kinds, hubs — in one call, once; cheaper than any exploratory walk.
- `query_ir / compile_ir / explain_ir` — auditing a decision. the compiler's decision as data — every symbol considered, admitted or dropped, and why; ~10x the pack's tokens, so never for obtaining context.

Each beats its filesystem equivalent at the thing it is specialized in. The filesystem remains
the authority for what no tool covers, and confirming a result with grep is never a failure.

## Memory — one call first, one call last, two calls for documents

MEMORY IS A TOOL, NOT A FILE. Call `start_task` before you think, plan or open anything — it returns this project's state (work-tree map, the last patches, the current recap, and the catalogue of every document), and it is the only way to obtain it. Close every patch with `end_task` (headline, session, handoff, recap); Sinapsi appends, rotates and archives the memory itself, mechanically. Everything else it holds — the workflow, the lessons, the RFCs, the ADRs, the archives — is read with `read_doc`, one generic call taking a document key or a directory. Never open a path inside the memory directory and never list it: the names, the budgets and the archiving are Sinapsi's, a path can go stale between two patches, and an agent that edits those files by hand corrupts the rotation that keeps history continuous.

**On Claude Code, Codex CLI and Gemini CLI, the first call already happened before you read
this.** `init` registers a `SessionStart` hook on all three that delivers a bundle — biases,
`handoff.md`, `session.md`, the project map — as the session's own context, marked `SINAPSI
SESSION CONTEXT`. If you see that marker above, `start_task` already ran; do not call it again
except to refresh mid-session. Call it yourself only where that marker is absent — on a host
without this mechanism (Copilot has none today), or if the hook never fired.

You write the prose; the arithmetic is not yours. **The division of labour between the four
closing fields is the discipline:** `headline` is one row; `session` is that row as an excursus
of **20-30 lines** — goal, what changed, how it was verified, what is open — never a document
with sections; `handoff` is the whole current state; `recap` is the overall in 5-10 lines. An
entry that repeats the handoff starves the sliding window.

**Every other document is read by key and written by key**, and both refuse rather than guess.
A decision that must survive, or a trap that must not bite twice, is one line appended to
`lessons` — that is an append, and the writer does it.

**150 lines is the target and 200 the hard ceiling for every Markdown file you write.** The
writer refuses past the ceiling and says so past the target. When one crosses the target,
compress or split it _in the same patch_ and say which you did.

Offline, `sinapsi start-task`, `end-task`, `read-doc`, `write-doc`, `new-doc` and `archive-rfc`
are the same operations, taking the same inputs.

## Practices — the team's standing biases

`practices/` is the team's voice: one file per practice, each opening with a `**Bias:**`
paragraph. **Sinapsi injects every bias automatically** — at session start, at task start and
on every message. You do not go looking for them. The body below a bias is its deep version;
read it when your work enters that practice's area (its `**When:**` line says when), and apply
what matched before calling the patch done. The folder is read live and never rewritten.

## Decisions

Write an **RFC** _before_ a boundary moves: public API, schema, storage format, an invariant, a
dependency. It states the problem, the measured evidence, the alternatives rejected, and the
test that would prove it wrong. Propose one when the boundary moves — do not wait to be asked.

Write an **ADR** _after_ it is decided, and it is immutable: supersede it, never edit it. Small
choices get no RFC — one line in `lessons` is the whole ceremony.

Both series — `rfc/` and `adr/` — are created by the allocator and written by the writer, and
read with the directory key to see what already exists. You never pick a number, and you never
open a path.

## Done

Working is half of it. The other half is that the codebase is easier to change than you found
it, and one question decides that: **if this logic changed tomorrow, could I change it in
exactly one place?** If not, the patch is unfinished — extract the shared thing now, confined to
the area you touched. A refactor that spreads further is an RFC, not a tidy-up.

Then, before you close: no duplicated logic, config or constant; no dead code, unused branch or
leftover workaround; coupling no worse, naming consistent with the code around it; the simplest
thing that meets the requirement, not the most general one. Every team bias that names your area
was honoured, and every practice whose **When** matched this task was read and applied.

**Engineer as if this will run for a decade and be read by someone else** — correct, tested,
reviewable, named for the next reader. Pragmatic, never ceremonial: scale the rigour to the
blast radius, not to the size of the gesture.

**Never report done without proof.** _Should work_ is not a result. A claim that something works
is backed by a command you ran and the output it printed, or by a test that fails without your
change and passes with it. If you could not run it, say exactly that: an honest _not verified_
is worth more than a confident guess.

And this project's own gate, detected from its manifests:

```sh
npm run build   # if defined
npm test
npm run lint    # if defined
```
