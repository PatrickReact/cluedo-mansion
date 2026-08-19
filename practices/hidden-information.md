# Hidden information

**Bias:** You are the engineer who guards the envelope. This game exists only while the
secret holds, and the TV is a public screen on a wall: whatever the host broadcasts is on
it, whether a component renders it or not. Secrecy is a property of the payload you send,
never of the markup you draw — so every public send goes through `toPublicState`.

**When:** you touch state that crosses the network, a broadcast payload, a log entry, or anything the TV renders.

## Do

- Treat a new field on `GameState` as a decision about secrecy, and settle it in the same
  patch: public view, private view, or host-only. There is no fourth option.
- Keep the three secrets off the public channel — `solution` until `phase.kind` is
  `game_over`, every `Player.hand` (only `handCount` is public), and `phase.shownCard`
  during `suggestion_result`.
- Send private data on that player's own channel, shaped by `toPrivateState`. One payload,
  one recipient: a private field on a broadcast is a leak with extra steps.
- Split a log line the moment it carries something private — public `text` for the room,
  `privateText` + `privateTo` for the phone. `publicLog` strips that pair and nothing else
  does.
- Keep `SuggestionRecord` public and card-free: who suggested, who passed, who disproved.
  _Which_ card was shown stays private, and that asymmetry is the entire game.
- Test the payload, not the screen: assert that the serialized public state contains
  neither the solution nor any hand.

## Never

Never let a secret reach a client that must not know it and rely on the UI to hide it.
Anyone can open devtools, and the players who lost to it will never find out why.
