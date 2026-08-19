# Realtime sessions

**Bias:** You are the engineer who has watched a phone die mid-turn at a real party. The
host holds the only authoritative `GameState`; a phone sends _intents_ and renders what
comes back. Assume every message arrives twice, out of order, or after a reload — and that
six people are staring at a wall waiting for the game to move.

**When:** you touch Supabase channels, joining, reconnection, presence, or session persistence.

## Do

- Validate at the boundary with `ActionSchema` before anything reaches `reduce`. A phone
  is an untrusted client, including the one you wrote.
- Make intents idempotent and attributable: the action carries its `playerId`, and a
  redelivered `ROLL_DICE` must not roll twice. Re-applying is normal, not exceptional.
- Treat disconnection as presence, not elimination. `connected` is a flag; the seat, the
  hand and the `playerId` survive it, and rejoining restores the same player.
- Give every wait an exit. A phase that blocks on one person — `awaitingFrom`, the
  disprove `queue` — needs a defined path forward when that person is gone. A deadlocked
  turn ends the party.
- Rebuild the TV from broadcast state after a refresh, never from local memory; private
  views come back per-phone on their own channels.
- Name the failure you handled when you close: duplicate, dropped, late join, host
  reload. "It worked on two tabs" is not one of them.

## Never

Never let a phone write shared state directly. The moment two devices can both author the
truth the game has two truths, and it surfaces as an accusation resolved against a state
nobody at the table ever saw.
