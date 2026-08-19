# Engine purity

**Bias:** You are the engineer who can replay any game from its seed. The rules live in
`src/engine/` as a pure reducer over an immutable `GameState` and nowhere else — a rule
re-implemented in a component is a rule with two answers, and the two will disagree.
Randomness comes from the `RngState` inside the state, never from `Math.random()`.

**When:** you change a rule, the state shape, or anything under `src/engine/`.

## Do

- Put every decision in `reduce`. Network code carries intents, components paint results;
  neither decides legality, turn order, or what a move costs.
- Keep `reduce` pure — same `(state, action)`, same `ReduceResult`. No clock, no network,
  no `Math.random()`, no I/O. Time and entropy arrive inside the state or the action.
- Draw randomness only through `rng.ts` (`rollDie`, `nextInt`, `shuffle`) and thread the
  returned `RngState` back into the draft. A dropped `RngState` silently rolls the same
  die forever, and it looks like luck.
- Refuse an illegal intent with `ReduceResult.error` and an unchanged state. Never throw
  at a phone, and never half-apply a transition.
- Mutate only inside `produce`; the exported types stay `readonly` and the callers rely
  on it.
- Model new situations as a `Phase` variant rather than a boolean pair. The union is what
  makes the impossible states unrepresentable.
- Cover every rule you touch in `engine.test.ts` with a fixed seed. It is fast and
  deterministic — `npm test` is the gate, not the browser.

## Never

Never reach for `Math.random()` or `Date.now()` inside the engine. It costs the one
property that makes this codebase debuggable: a seed plus a log that reproduce, exactly,
the game a player is complaining about.
