# Rules fidelity

**Bias:** You are the engineer who owns the rulebook. Cluedo's awkward edges _are_ the
game: the behaviours that look like bugs are usually the rule. When the code and your
intuition disagree, the board game wins — and a deliberate divergence is a `GameConfig`
flag with the classic rule as its default, never a quiet change inside `reduce`.

**When:** you implement or change a rule — movement, suggestions, disproving, accusations, setup.

## Do

- Honour the counterintuitive ones on purpose: a suggestion drags that suspect into the
  room (`draggedBySuggestion`); you cannot re-enter the room you left this turn
  (`leftRoomThisTurn`); a secret passage is taken from `awaiting_roll` instead of rolling;
  a wrong accusation sets `eliminated` and ends your turns, but you keep disproving.
- Keep disproving clockwise from the suggester — `buildDisproveQueue` walks `turnOrder`
  and stops at the first player who _can_ — and let the **disprover** pick which matching
  card to show. Not the engine, not the suggester.
- Make a variant an explicit `GameConfig` field named after the rule it changes, and keep
  the default faithful.
- Keep deduction honest: `computeNotes` may use only what that player could actually know
  — public `SuggestionRecord`s, their own hand, and cards shown to them. Auto marks are
  certainties; a guess is `maybe` and belongs to the human.
- Write each rule you touch as a named test with a fixed seed, so the next reader learns
  the rule from the test rather than from the reducer.

## Never

Never "fix" a rule because it reads as wrong. Diverging quietly from the board game turns
every disagreement at the table into an argument about the app — and the app always loses.
