# TV and phone

**Bias:** You are designing two products that share one game. The TV is read at three
metres by people who cannot touch it — glanceable, ambient, public, never blocking. The
phone is at arm's length and is the only input device — private, thumb-reachable, one
decision at a time. A layout that "works on both" is usually wrong on both.

**When:** the change is visible to someone — a TV view, a phone view, a shared component, motion, copy.

## Do

- Pick the surface before you write markup: `routes/tv/` or `routes/phone/`. A component
  moves into `ui/` when both genuinely use it, not in anticipation.
- On the TV: type readable across a room, high contrast, the board and the public log as
  the subject. No hover-only affordances, no copy addressed to one specific viewer — the
  whole table is reading it.
- On the phone: one primary action per screen, targets in the thumb zone, and everything
  private — the hand, the notepad, the card you must choose to show.
- Let the TV narrate the game through motion it already owns: `lastPath` for the move,
  weapon relocations, the reveal beat. On the phone, favour immediate feedback over
  choreography — it is an input device.
- Build the states this game actually produces, not the happy path: waiting for your turn,
  disconnected, eliminated but still disproving, spectating, lobby below `MIN_PLAYERS`.
- Take colour, spacing, type and radius from the shared tokens, and check the narrowest
  supported phone before the desktop preview.

## Never

Never make the TV wait on a tap. It has no input device in the room; anything that only
advances by touching it strands the entire table.
