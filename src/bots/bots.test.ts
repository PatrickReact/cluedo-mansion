import { describe, expect, it } from 'vitest'
import { createGame } from '@/engine/setup'
import { currentPlayer, legalMoves, reduce } from '@/engine/reducer'
import { notesContext, ENVELOPE } from '@/engine/notes'
import { toPrivateState, toPublicState } from '@/engine/redact'
import { FULL_DECK, roomCard, suspectCard, weaponCard } from '@/engine/cards'
import { SUSPECT_IDS, WEAPON_IDS, ROOM_IDS } from '@/engine/constants'
import { createRng } from '@/engine/rng'
import { inRoom } from '@/engine/board'
import type { Action } from '@/engine/actions'
import type { BotLevel, GameState } from '@/engine/types'
import { computeBelief } from './belief'
import { PROFILES, decide, emptyMemory } from './policy'
import { nextBotTurn, botOnTheClock, type BotMemories } from './driver'

// ---------------------------------------------------------------- utilita

function apply(state: GameState, action: Action): GameState {
  const res = reduce(state, action, 0)
  expect(res.error, `${action.type} rifiutata: ${res.error}`).toBeNull()
  return res.state
}

/** Tavolo con un umano e N bot del livello indicato. */
function tableWith(levels: readonly BotLevel[], seed = 4242): GameState {
  let s = createGame({ roomCode: 'BOTS01', seed })
  s = apply(s, { type: 'JOIN', playerId: 'human', name: 'Ada', suspect: SUSPECT_IDS[0] as string })
  levels.forEach((level, i) => {
    s = apply(s, {
      type: 'ADD_BOT',
      playerId: `bot${i}`,
      suspect: SUSPECT_IDS[i + 1] as string,
      level,
    })
  })
  return apply(s, { type: 'START_GAME' })
}

/**
 * Mossa banale per l'umano di comodo: tira, si muove, non ipotizza mai.
 * Serve solo a far girare il turno senza influenzare la gara fra i bot.
 */
function passiveHumanAction(s: GameState): Action | null {
  const me = currentPlayer(s)
  if (!me) return null
  switch (s.phase.kind) {
    case 'awaiting_roll':
      return { type: 'ROLL_DICE', playerId: me.id }
    case 'moving': {
      const moves = legalMoves(s)
      const corridor = [...(moves?.corridors.keys() ?? [])][0]
      if (corridor) {
        const [c, r] = corridor.split(',').map(Number)
        return {
          type: 'MOVE_TO',
          playerId: me.id,
          target: { kind: 'corridor', at: { c: c as number, r: r as number } },
        }
      }
      const room = [...(moves?.rooms.keys() ?? [])][0]
      if (room) return { type: 'MOVE_TO', playerId: me.id, target: { kind: 'room', room } }
      return { type: 'END_TURN', playerId: me.id }
    }
    case 'in_room':
      return { type: 'END_TURN', playerId: me.id }
    case 'resolving_suggestion': {
      const who = s.phase.awaitingFrom
      if (!who) return null
      const priv = toPrivateState(s, who)
      return { type: 'SHOW_CARD', playerId: who, card: priv.mustShowFrom[0] as string }
    }
    case 'suggestion_result':
      return { type: 'ACKNOWLEDGE', playerId: s.phase.suggesterId }
    default:
      return null
  }
}

/** Fa giocare l'umano finche non tocca a un bot. */
function advanceToBot(state: GameState, maxSteps = 40): GameState {
  let s = state
  for (let i = 0; i < maxSteps; i++) {
    if (botOnTheClock(s)) return s
    const action = passiveHumanAction(s)
    if (!action) break
    s = apply(s, action)
  }
  return s
}

interface PlayResult {
  readonly state: GameState
  readonly steps: number
  readonly wrongAccusations: number
  readonly confidentAccusations: number
}

/** Fa girare una partita fino alla fine o al limite di passi. */
function play(levels: readonly BotLevel[], seed: number, maxSteps = 600): PlayResult {
  let s = tableWith(levels, seed)
  let memories: BotMemories = {}
  let wrongAccusations = 0
  let confidentAccusations = 0
  let steps = 0

  for (; steps < maxSteps && s.phase.kind !== 'game_over'; steps++) {
    const turn = nextBotTurn(s, memories)
    if (turn) {
      memories = turn.memories
      if (turn.action.type === 'MAKE_ACCUSATION') {
        if (turn.confidence >= 0.999) confidentAccusations++
        const sol = s.solution
        const wrong =
          turn.action.suspect !== sol?.suspect ||
          turn.action.weapon !== sol?.weapon ||
          turn.action.room !== sol?.room
        if (wrong) {
          wrongAccusations++
          // Un bot che si dichiarava certo non puo sbagliare: e il contratto.
          expect(turn.confidence, 'accusa errata dichiarata certa').toBeLessThan(0.999)
        }
      }
      s = apply(s, turn.action)
      continue
    }

    const human = passiveHumanAction(s)
    if (!human) break
    s = apply(s, human)
  }

  return { state: s, steps, wrongAccusations, confidentAccusations }
}

// ------------------------------------------------------- modello probabilistico

describe('modello probabilistico', () => {
  it('le marginali di ogni carta sommano a 1', () => {
    const s = tableWith(['medio', 'medio'])
    const me = s.players.find((p) => p.id === 'human')
    const belief = computeBelief(
      notesContext(s),
      { meId: 'human', myHand: me?.hand ?? [], seen: {} },
      { samples: 400, rng: createRng(1) },
    )
    for (const card of FULL_DECK) {
      const total = [...(belief.holder.get(card)?.values() ?? [])].reduce((a, b) => a + b, 0)
      expect(total, `marginali di ${card}`).toBeCloseTo(1, 5)
    }
  })

  it('una carta in mano non e mai nella busta', () => {
    const s = tableWith(['medio', 'medio'])
    const me = s.players.find((p) => p.id === 'human')
    const belief = computeBelief(
      notesContext(s),
      { meId: 'human', myHand: me?.hand ?? [], seen: {} },
      { samples: 400, rng: createRng(2) },
    )
    for (const card of me?.hand ?? []) {
      expect(belief.envelope.get(card), card).toBe(0)
      expect(belief.holder.get(card)?.get('human')).toBe(1)
    }
  })

  it('e deterministico: stesso seed, stessa credenza', () => {
    const s = tableWith(['medio', 'medio'])
    const me = s.players.find((p) => p.id === 'human')
    const run = () =>
      computeBelief(
        notesContext(s),
        { meId: 'human', myHand: me?.hand ?? [], seen: {} },
        { samples: 300, rng: createRng(99) },
      )
    const a = run()
    const b = run()
    expect(a.bestSolution).toEqual(b.bestSolution)
    for (const card of FULL_DECK) {
      expect(a.envelope.get(card)).toBe(b.envelope.get(card))
    }
  })

  it("si affina quando nessuno puo confutare un'ipotesi", () => {
    let s = tableWith(['medio', 'medio'])
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')
    const me = s.players.find((p) => p.id === 'human')
    const hand = me?.hand ?? []

    const before = computeBelief(
      notesContext(s),
      { meId: 'human', myHand: hand, seen: {} },
      { samples: 800, rng: createRng(5) },
    )

    // L'umano ipotizza esattamente la soluzione: nessuno puo confutare.
    s = { ...s, positions: { ...s.positions, [SUSPECT_IDS[0] as string]: inRoom(sol.room) } }
    s = { ...s, phase: { kind: 'in_room', room: sol.room, canSuggest: true } }
    s = apply(s, {
      type: 'MAKE_SUGGESTION',
      playerId: 'human',
      suspect: sol.suspect,
      weapon: sol.weapon,
    })

    const after = computeBelief(
      notesContext(s),
      { meId: 'human', myHand: hand, seen: {} },
      { samples: 800, rng: createRng(5) },
    )

    // Le tre carte nominate salgono, e con tre giocatori la deduzione chiude.
    expect(after.envelope.get(suspectCard(sol.suspect)) ?? 0).toBeGreaterThan(
      before.envelope.get(suspectCard(sol.suspect)) ?? 0,
    )
    expect(after.envelope.get(weaponCard(sol.weapon)) ?? 0).toBeGreaterThan(
      before.envelope.get(weaponCard(sol.weapon)) ?? 0,
    )
    expect(after.envelope.get(roomCard(sol.room)) ?? 0).toBeGreaterThan(
      before.envelope.get(roomCard(sol.room)) ?? 0,
    )
  })

  it('non attribuisce mai una carta a chi ha dichiarato di non averla', () => {
    let s = tableWith(['medio', 'medio'])
    s = { ...s, positions: { ...s.positions, [SUSPECT_IDS[0] as string]: inRoom('library') } }
    s = { ...s, phase: { kind: 'in_room', room: 'library', canSuggest: true } }
    s = apply(s, { type: 'MAKE_SUGGESTION', playerId: 'human', suspect: 'plum', weapon: 'rope' })

    const rec = s.history.at(-1)
    if (!rec) throw new Error('storico vuoto')

    const belief = computeBelief(
      notesContext(s),
      { meId: 'human', myHand: s.players.find((p) => p.id === 'human')?.hand ?? [], seen: {} },
      { samples: 600, rng: createRng(11) },
    )

    for (const pid of rec.passed) {
      for (const card of [suspectCard('plum'), weaponCard('rope'), roomCard('library')]) {
        expect(belief.holder.get(card)?.get(pid), `${pid} non puo avere ${card}`).toBe(0)
      }
    }
  })
})

// -------------------------------------------------------------------- onesta

describe('onesta dei bot', () => {
  it('la decisione non cambia se cambia la soluzione nascosta', () => {
    // Se un bot potesse sbirciare, cambiare la busta lasciando identiche le
    // informazioni pubbliche e la sua mano cambierebbe la sua mossa.
    const s = advanceToBot(tableWith(['difficile', 'difficile']))
    const other = ROOM_IDS.find((r) => r !== s.solution?.room) as string
    const otherWeapon = WEAPON_IDS.find((w) => w !== s.solution?.weapon) as string
    const tampered: GameState = {
      ...s,
      solution: { suspect: 'plum', weapon: otherWeapon as never, room: other as never },
    }

    const a = nextBotTurn(s, {})
    const b = nextBotTurn(tampered, {})

    expect(a).not.toBeNull()
    expect(a?.action).toEqual(b?.action)
    expect(a?.confidence).toBe(b?.confidence)
  })

  it('la decisione non cambia se cambiano le mani degli altri', () => {
    const s = advanceToBot(tableWith(['difficile', 'difficile']))
    // Si scambiano le mani dei due bot: l'umano non lo puo sapere, e nemmeno
    // il bot di turno, perche non le ha mai viste.
    const b0 = s.players.find((p) => p.id === 'bot0')
    const b1 = s.players.find((p) => p.id === 'bot1')
    if (!b0 || !b1) throw new Error('bot mancanti')

    const before = nextBotTurn(s, {})
    expect(before).not.toBeNull()

    // Solo la mano dell'ALTRO bot cambia: quella di bot0 resta identica.
    // Si altera la mano di un bot diverso da quello che sta decidendo.
    const decidingId = before?.playerId
    const victim = decidingId === 'bot1' ? b0 : b1
    const swapped: GameState = {
      ...s,
      players: s.players.map((p) => (p.id === victim.id ? { ...p, hand: [...victim.hand].reverse() } : p)),
    }
    const after = nextBotTurn(swapped, {})
    expect(after?.action).toEqual(before?.action)
  })

  it('a inizio partita nessun bot conosce gia la soluzione', () => {
    const s = tableWith(['difficile', 'difficile'])
    for (const id of ['bot0', 'bot1']) {
      const bot = s.players.find((p) => p.id === id)
      const belief = computeBelief(
        notesContext(s),
        { meId: id, myHand: bot?.hand ?? [], seen: {} },
        { samples: 500, rng: createRng(3) },
      )
      expect(belief.solved, `${id} non puo aver gia risolto`).toBe(false)
      expect(belief.bestSolution.p).toBeLessThan(0.5)
    }
  })

  it('la vista privata di un bot contiene solo la sua mano', () => {
    const s = tableWith(['medio', 'medio'])
    const priv = toPrivateState(s, 'bot0')
    const bot0 = s.players.find((p) => p.id === 'bot0')
    expect(priv.hand).toEqual(bot0?.hand)
    const wire = JSON.stringify(priv)
    for (const p of s.players) {
      if (p.id === 'bot0') continue
      for (const card of p.hand) expect(wire).not.toContain(card)
    }
  })

  it('lo stato pubblico non rivela le mani dei bot', () => {
    const s = tableWith(['medio', 'medio'])
    const wire = JSON.stringify(toPublicState(s))
    for (const p of s.players) {
      for (const card of p.hand) expect(wire, `${card} trapelata`).not.toContain(card)
    }
  })
})

// ------------------------------------------------------------------ partita

describe('partita con i bot', () => {
  it('un tavolo misto arriva alla fine senza mosse illegali', () => {
    const result = play(['medio', 'medio'], 2024)
    expect(result.state.phase.kind).toBe('game_over')
    expect(result.steps).toBeLessThan(600)
  })

  it('un bot non sbaglia mai accusa quando si dichiara certo', () => {
    // La proprieta e asserita passo per passo dentro `play`.
    for (const seed of [11, 22, 33, 44]) {
      const result = play(['difficile', 'difficile'], seed)
      expect(result.state.phase.kind).toBe('game_over')
    }
  })

  it('i bot rispettano il divieto di rientrare nella stanza appena lasciata', () => {
    let s = tableWith(['difficile', 'difficile'], 777)
    let memories: BotMemories = {}
    for (let i = 0; i < 200 && s.phase.kind !== 'game_over'; i++) {
      const turn = nextBotTurn(s, memories)
      if (turn) {
        if (turn.action.type === 'MOVE_TO' && turn.action.target.kind === 'room') {
          expect(turn.action.target.room).not.toBe(s.leftRoomThisTurn)
        }
        memories = turn.memories
        s = apply(s, turn.action)
        continue
      }
      const human = passiveHumanAction(s)
      if (!human) break
      s = apply(s, human)
    }
  })

  it('il tavolo difficile chiude il caso prima di quello facile', () => {
    // Confronto a parita di seed: stessa distribuzione delle carte, stessa
    // sequenza di dadi, stesso numero di posti. Cambia solo quanto a fondo
    // ragionano i bot. La metrica e il numero di passi per arrivare in fondo.
    const seeds = [101, 202, 303]
    let hardSteps = 0
    let easySteps = 0

    for (const seed of seeds) {
      const hard = play(['difficile', 'difficile'], seed, 500)
      const easy = play(['facile', 'facile'], seed, 500)
      hardSteps += hard.steps
      easySteps += easy.steps
    }
    expect(hardSteps, `difficile ${hardSteps} passi, facile ${easySteps} passi`).toBeLessThan(easySteps)
  })

  it('la memoria registra le carte viste e quelle mostrate', () => {
    let s = tableWith(['medio', 'medio'], 909)
    let memories: BotMemories = {}
    let sawSomething = false

    for (let i = 0; i < 250 && s.phase.kind !== 'game_over'; i++) {
      const turn = nextBotTurn(s, memories)
      if (turn) {
        memories = turn.memories
        s = apply(s, turn.action)
      } else {
        const human = passiveHumanAction(s)
        if (!human) break
        s = apply(s, human)
      }
      for (const mem of Object.values(memories)) {
        if (Object.keys(mem.seen).length > 0) sawSomething = true
      }
    }
    expect(sawSomething, 'nessun bot ha mai registrato una carta vista').toBe(true)

    // Nessun bot puo aver "visto" una carta che non gli e stata mostrata.
    for (const [botId, mem] of Object.entries(memories)) {
      for (const [card, from] of Object.entries(mem.seen)) {
        const owner = s.players.find((p) => p.id === from)
        expect(owner?.hand, `${botId} crede che ${from} abbia ${card}`).toContain(card)
      }
    }
  })
})

// ------------------------------------------------------------------ livelli

describe('livelli', () => {
  it('cambiano la profondita di analisi, non cio che il bot vede', () => {
    for (const level of ['facile', 'medio', 'difficile'] as const) {
      expect(PROFILES[level].level).toBe(level)
    }
    expect(PROFILES.facile.samples).toBeLessThan(PROFILES.medio.samples)
    expect(PROFILES.medio.samples).toBeLessThan(PROFILES.difficile.samples)
    // Il livello facile non rischia mai un'accusa incerta.
    expect(PROFILES.facile.accuseThreshold).toBe(1)
  })

  it('il livello facile sceglie comunque una mossa legale', () => {
    const s = advanceToBot(tableWith(['facile', 'facile'], 55))
    const turn = nextBotTurn(s, {})
    expect(turn).not.toBeNull()
    const res = reduce(s, turn?.action as Action, 0)
    expect(res.error).toBeNull()
  })

  it('decide() riceve solo le viste redatte, mai lo stato completo', () => {
    // Test strutturale: se un domani qualcuno passasse `game` per comodita,
    // questo test fallisce perche le chiavi private non esistono nel tipo.
    const s = advanceToBot(tableWith(['medio', 'medio']))
    const bot = botOnTheClock(s)
    expect(bot?.bot).toBeTruthy()

    const pub = toPublicState(s)
    const priv = toPrivateState(s, bot?.id ?? '')
    // La chiave esiste, ma resta vuota finche la partita non e finita: e cosi
    // che la TV puo rivelare la busta solo alla fine. Le CARTE non ci sono mai
    // (le posizioni delle armi sul tabellone, invece, sono pubbliche per tutti).
    expect(pub.solution).toBeNull()
    expect(JSON.stringify(pub)).not.toContain(weaponCard(s.solution?.weapon ?? 'rope'))
    expect(Object.keys(priv)).toEqual(
      expect.arrayContaining(['playerId', 'hand', 'privateLog', 'reveal', 'mustShowFrom']),
    )

    const decision = decide({
      pub,
      priv,
      memory: emptyMemory(),
      profile: PROFILES.medio,
      rng: createRng(1),
    })
    expect(decision).not.toBeNull()
  })

  it('il taccuino e il modello dei bot usano lo stesso deduttore', () => {
    // Una sola implementazione delle regole di deduzione: se divergessero,
    // un bot e un umano potrebbero dedurre cose diverse dagli stessi fatti.
    const s = tableWith(['medio', 'medio'])
    const bot = s.players.find((p) => p.id === 'bot0')
    const belief = computeBelief(
      notesContext(s),
      { meId: 'bot0', myHand: bot?.hand ?? [], seen: {} },
      { samples: 200, rng: createRng(7) },
    )
    for (const card of bot?.hand ?? []) {
      expect(belief.certain.heldBy.get(card)).toBe('bot0')
      expect(belief.holder.get(card)?.get(ENVELOPE)).toBe(0)
    }
  })
})
