import { describe, expect, it } from 'vitest'
import { board, coordKey, corridorAt, inRoom, reachable, secretPassageFrom } from './board'
import { BOARD_HEIGHT, BOARD_WIDTH, DOORS, START_POSITIONS } from './board/map'
import { FULL_DECK, matchingCards, roomCard, suspectCard, weaponCard } from './cards'
import { ROOM_IDS, SUSPECT_IDS, WEAPON_IDS } from './constants'
import { createRng, rollDie, shuffle } from './rng'
import { createGame, dealCards } from './setup'
import { MAX_PLAYERS, MIN_PLAYERS, currentPlayer, legalMoves, reduce } from './reducer'
import { toPrivateState, toPublicState } from './redact'
import { computeNotes, ENVELOPE, expectedHandSizes, notesContext } from './notes'
import type { Action } from './actions'
import type { GameState, Player } from './types'

// ---------------------------------------------------------------- utilities

/** Applica una sequenza di azioni, fallendo al primo rifiuto inatteso. */
function run(state: GameState, actions: Action[]): GameState {
  let s = state
  for (const a of actions) {
    const res = reduce(s, a, 0)
    expect(res.error, `azione ${a.type} rifiutata: ${res.error}`).toBeNull()
    s = res.state
  }
  return s
}

function lobbyWith(count: number, seed = 42): GameState {
  const names = ['Ada', 'Bruno', 'Carla', 'Dario', 'Elena', 'Fabio']
  let s = createGame({ roomCode: 'TEST', seed })
  for (let i = 0; i < count; i++) {
    s = run(s, [
      { type: 'JOIN', playerId: `p${i}`, name: names[i] as string, suspect: SUSPECT_IDS[i] as string },
    ])
  }
  return s
}

const started = (count = 3, seed = 42): GameState => run(lobbyWith(count, seed), [{ type: 'START_GAME' }])

// ---------------------------------------------------------------- tabellone

describe('tabellone', () => {
  it('ha le dimensioni dichiarate e nessuna riga malformata', () => {
    expect(board.width).toBe(BOARD_WIDTH)
    expect(board.height).toBe(BOARD_HEIGHT)
    expect(board.tiles).toHaveLength(BOARD_HEIGHT)
    for (const row of board.tiles) expect(row).toHaveLength(BOARD_WIDTH)
  })

  it('ha 9 stanze e 17 porte, con la distribuzione classica', () => {
    expect(board.roomTiles.size).toBe(9)
    expect(DOORS).toHaveLength(17)
    const perRoom = Object.fromEntries([...board.doorsByRoom].map(([r, d]) => [r, d.length]))
    expect(perRoom).toEqual({
      kitchen: 1,
      ballroom: 4,
      conservatory: 1,
      dining: 2,
      billiard: 2,
      library: 2,
      lounge: 1,
      hall: 3,
      study: 1,
    })
  })

  it('ogni porta collega una soglia di stanza a un corridoio adiacente', () => {
    for (const d of DOORS) {
      expect(board.roomAt(d.threshold.c, d.threshold.r)).toBe(d.room)
      expect(board.isWalkableCorridor(d.corridor.c, d.corridor.r)).toBe(true)
      const dist = Math.abs(d.threshold.c - d.corridor.c) + Math.abs(d.threshold.r - d.corridor.r)
      expect(dist).toBe(1)
    }
  })

  it('collega gli angoli opposti con i due passaggi segreti', () => {
    expect(secretPassageFrom('kitchen')).toBe('study')
    expect(secretPassageFrom('study')).toBe('kitchen')
    expect(secretPassageFrom('lounge')).toBe('conservatory')
    expect(secretPassageFrom('conservatory')).toBe('lounge')
    expect(secretPassageFrom('hall')).toBeNull()
  })

  it('ha tutti i corridoi raggiungibili fra loro', () => {
    const start = START_POSITIONS.scarlett
    const seen = new Set<string>([coordKey(start)])
    const queue = [start]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (!cur) break
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const c = cur.c + dc
        const r = cur.r + dr
        const k = `${c},${r}`
        if (board.isWalkableCorridor(c, r) && !seen.has(k)) {
          seen.add(k)
          queue.push({ c, r })
        }
      }
    }
    let total = 0
    for (const row of board.tiles) for (const t of row) if (t.kind === 'corridor') total++
    expect(seen.size).toBe(total)
  })

  it('mette ogni pedina di partenza su un corridoio', () => {
    for (const id of SUSPECT_IDS) {
      const p = START_POSITIONS[id]
      expect(board.isWalkableCorridor(p.c, p.r), `${id} non parte su un corridoio`).toBe(true)
    }
  })

  it('non permette di attraversare la cantina', () => {
    let cellar = 0
    for (const row of board.tiles) for (const t of row) if (t.kind === 'cellar') cellar++
    expect(cellar).toBeGreaterThan(0)
    const near = reachable(corridorAt(9, 13), 6, {})
    for (const k of near.corridors.keys()) {
      const [c, r] = k.split(',').map(Number)
      expect(board.tileAt(c as number, r as number)?.kind).toBe('corridor')
    }
  })
})

// -------------------------------------------------------------- pathfinding

describe('movimento', () => {
  it('con 1 non si va oltre le caselle adiacenti', () => {
    const res = reachable(corridorAt(7, 4), 1, {})
    for (const t of res.corridors.values()) expect(t.steps).toBe(1)
    // (7,4) e davanti alla porta ovest della sala da ballo.
    expect(res.rooms.has('ballroom')).toBe(true)
  })

  it('entrare in una stanza consuma un passo e termina il movimento', () => {
    const res = reachable(corridorAt(7, 4), 6, {})
    const ballroom = res.rooms.get('ballroom')
    expect(ballroom?.steps).toBe(1)
    // Nessuna casella oltre la stanza: entrare chiude il turno.
    expect(ballroom?.path.at(-1)).toEqual({ c: 8, r: 4 })
  })

  it('non attraversa le pedine e non ci si ferma sopra', () => {
    const blocked = new Set([coordKey({ c: 7, r: 3 })])
    const free = reachable(corridorAt(7, 1), 3, {})
    const stuck = reachable(corridorAt(7, 1), 3, { blocked })
    expect(free.corridors.has('7,4')).toBe(true)
    expect(stuck.corridors.has('7,3')).toBe(false)
    expect(stuck.corridors.has('7,4')).toBe(false)
  })

  it('vieta di rientrare nella stanza appena lasciata', () => {
    const libero = reachable(inRoom('ballroom'), 4, {})
    expect(libero.rooms.has('ballroom')).toBe(true)
    const vietato = reachable(inRoom('ballroom'), 4, { forbiddenRoom: 'ballroom' })
    expect(vietato.rooms.has('ballroom')).toBe(false)
  })

  it('uscendo da una stanza parte da una qualsiasi delle sue porte', () => {
    // La sala da ballo ha 4 porte: con 1 passo si raggiungono tutte e 4.
    const res = reachable(inRoom('ballroom'), 1, {})
    const oneStep = [...res.corridors.values()].filter((t) => t.steps === 1)
    expect(oneStep).toHaveLength(4)
  })

  it('non entra mai in una stanza se non da una porta', () => {
    // (0,7) e adiacente a caselle della cucina ma non c'e una porta li.
    const res = reachable(corridorAt(0, 7), 2, {})
    expect(res.rooms.has('kitchen')).toBe(false)
  })
})

// ---------------------------------------------------------------------- rng

describe('rng deterministico', () => {
  it('stesso seed, stessa sequenza di dadi', () => {
    const roll = (seed: number): number[] => {
      let s = createRng(seed)
      const out: number[] = []
      for (let i = 0; i < 20; i++) {
        const [v, ns] = rollDie(s)
        s = ns
        out.push(v)
      }
      return out
    }
    expect(roll(1234)).toEqual(roll(1234))
    expect(roll(1234)).not.toEqual(roll(5678))
  })

  it('produce solo facce da 1 a 6', () => {
    let s = createRng(7)
    for (let i = 0; i < 500; i++) {
      const [v, ns] = rollDie(s)
      s = ns
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
  })

  it('mescola senza perdere ne duplicare elementi', () => {
    const [out] = shuffle(FULL_DECK, createRng(99))
    expect(out).toHaveLength(FULL_DECK.length)
    expect(new Set(out).size).toBe(FULL_DECK.length)
  })
})

// -------------------------------------------------------------------- carte

describe('mazzo e distribuzione', () => {
  it('il mazzo ha 21 carte uniche', () => {
    expect(FULL_DECK).toHaveLength(21)
    expect(new Set(FULL_DECK).size).toBe(21)
    expect(SUSPECT_IDS).toHaveLength(6)
    expect(WEAPON_IDS).toHaveLength(6)
    expect(ROOM_IDS).toHaveLength(9)
  })

  it.each([3, 4, 5, 6])('con %i giocatori distribuisce tutte le 18 carte restanti', (n) => {
    const { solution, hands } = dealCards(n, createRng(n * 31))
    const dealt = hands.flat()
    expect(dealt).toHaveLength(18)
    expect(new Set(dealt).size).toBe(18)
    // La soluzione non e in nessuna mano.
    expect(dealt).not.toContain(suspectCard(solution.suspect))
    expect(dealt).not.toContain(weaponCard(solution.weapon))
    expect(dealt).not.toContain(roomCard(solution.room))
    // Le mani differiscono al massimo di una carta.
    const sizes = hands.map((h) => h.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('riconosce le carte che confutano un ipotesi', () => {
    const hand = [suspectCard('plum'), weaponCard('rope'), roomCard('kitchen')]
    const m = matchingCards(hand, { suspect: 'plum', weapon: 'dagger', room: 'kitchen' })
    expect(m.sort()).toEqual([roomCard('kitchen'), suspectCard('plum')].sort())
  })
})

// ------------------------------------------------------------------- lobby

describe('lobby', () => {
  it('rifiuta un personaggio gia scelto', () => {
    const s = lobbyWith(2)
    const res = reduce(s, { type: 'JOIN', playerId: 'x', name: 'Zoe', suspect: SUSPECT_IDS[0] as string }, 0)
    expect(res.error).toMatch(/gia scelto/i)
    expect(res.state.players).toHaveLength(2)
  })

  it('non supera i 6 giocatori', () => {
    const s = lobbyWith(MAX_PLAYERS)
    const res = reduce(s, { type: 'JOIN', playerId: 'x', name: 'Zoe', suspect: 'scarlett' }, 0)
    expect(res.error).toBeTruthy()
  })

  it(`non parte con meno di ${MIN_PLAYERS} giocatori`, () => {
    const res = reduce(lobbyWith(2), { type: 'START_GAME' }, 0)
    expect(res.error).toMatch(/almeno/i)
  })

  it('distribuisce le carte e apre il primo turno', () => {
    const s = started(4)
    expect(s.phase.kind).toBe('awaiting_roll')
    expect(s.solution).not.toBeNull()
    const total = s.players.reduce((n, p) => n + p.hand.length, 0)
    expect(total).toBe(18)
    expect(s.turnNumber).toBe(1)
  })

  it('rispetta l ordine di turno canonico', () => {
    const s = started(3)
    // I primi tre sospetti sono scarlett, mustard, white.
    expect(s.turnOrder).toEqual(['scarlett', 'mustard', 'white'])
    expect(currentPlayer(s)?.suspect).toBe('scarlett')
  })
})

// -------------------------------------------------------------------- turno

describe('turno', () => {
  it('rifiuta il tiro di chi non e di turno', () => {
    const s = started(3)
    const res = reduce(s, { type: 'ROLL_DICE', playerId: 'p1' }, 0)
    expect(res.error).toMatch(/non e il tuo turno/i)
  })

  it('tira due dadi e propone solo mosse legali', () => {
    const s = run(started(3), [{ type: 'ROLL_DICE', playerId: 'p0' }])
    expect(s.phase.kind).toBe('moving')
    if (s.phase.kind !== 'moving') throw new Error('fase inattesa')
    const total = s.phase.dice[0] + s.phase.dice[1]
    expect(total).toBeGreaterThanOrEqual(2)
    expect(total).toBeLessThanOrEqual(12)

    const moves = legalMoves(s)
    expect(moves).not.toBeNull()
    for (const target of moves?.corridors.values() ?? []) {
      expect(target.steps).toBeLessThanOrEqual(total)
    }
  })

  it('rifiuta una destinazione fuori portata', () => {
    const s = run(started(3), [{ type: 'ROLL_DICE', playerId: 'p0' }])
    const res = reduce(
      s,
      { type: 'MOVE_TO', playerId: 'p0', target: { kind: 'corridor', at: { c: 0, r: 17 } } },
      0,
    )
    expect(res.error).toMatch(/non raggiungibile/i)
  })

  it('muoversi in corridoio chiude il turno, entrare in stanza no', () => {
    let s = run(started(3), [{ type: 'ROLL_DICE', playerId: 'p0' }])
    const moves = legalMoves(s)
    const first = [...(moves?.corridors.entries() ?? [])][0]
    if (!first) throw new Error('nessuna mossa disponibile')
    const [k] = first
    const [c, r] = k.split(',').map(Number)
    s = run(s, [
      {
        type: 'MOVE_TO',
        playerId: 'p0',
        target: { kind: 'corridor', at: { c: c as number, r: r as number } },
      },
    ])
    expect(s.phase.kind).toBe('awaiting_roll')
    expect(currentPlayer(s)?.id).toBe('p1')
    expect(s.turnNumber).toBe(2)
  })

  it('il passaggio segreto sposta fra angoli opposti senza tirare', () => {
    let s = started(3)
    s = { ...s, positions: { ...s.positions, scarlett: inRoom('kitchen') } }
    s = run(s, [{ type: 'USE_SECRET_PASSAGE', playerId: 'p0' }])
    expect(s.positions.scarlett).toEqual(inRoom('study'))
    expect(s.phase).toEqual({ kind: 'in_room', room: 'study', canSuggest: true })
    expect(s.leftRoomThisTurn).toBe('kitchen')
  })

  it('rifiuta il passaggio segreto da una stanza che non ne ha', () => {
    let s = started(3)
    s = { ...s, positions: { ...s.positions, scarlett: inRoom('hall') } }
    const res = reduce(s, { type: 'USE_SECRET_PASSAGE', playerId: 'p0' }, 0)
    expect(res.error).toMatch(/passaggio segreto/i)
  })
})

// ------------------------------------------------------------------ ipotesi

/** Porta il giocatore indicato dentro una stanza, saltando il movimento. */
function placeInRoom(s: GameState, playerId: string, room: Parameters<typeof inRoom>[0]): GameState {
  const p = s.players.find((x) => x.id === playerId) as Player
  return {
    ...s,
    positions: { ...s.positions, [p.suspect]: inRoom(room) },
    phase: { kind: 'in_room', room, canSuggest: true },
  }
}

describe('ipotesi e confutazione', () => {
  it('trascina sospetto e arma nella stanza', () => {
    let s = placeInRoom(started(3), 'p0', 'library')
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }])
    expect(s.positions.plum).toEqual(inRoom('library'))
    expect(s.weapons.rope).toBe('library')
  })

  it('interroga in senso orario e si ferma alla prima confutazione', () => {
    let s = started(3)
    // Mani costruite a mano per un esito deterministico.
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p1'
          ? { ...p, hand: [suspectCard('plum')] }
          : p.id === 'p2'
            ? { ...p, hand: [weaponCard('rope')] }
            : { ...p, hand: [roomCard('hall')] },
      ),
    }
    s = placeInRoom(s, 'p0', 'library')
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }])

    // p1 e il primo in senso orario e ha una sola carta: mostra in automatico.
    expect(s.phase.kind).toBe('suggestion_result')
    if (s.phase.kind !== 'suggestion_result') throw new Error('fase inattesa')
    expect(s.phase.disprovedBy).toBe('p1')
    expect(s.phase.shownCard).toBe(suspectCard('plum'))

    const rec = s.history.at(-1)
    expect(rec?.disprovedBy).toBe('p1')
    expect(rec?.passed).toEqual([])
  })

  it('chi non puo confutare passa e viene registrato', () => {
    let s = started(3)
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p2' ? { ...p, hand: [weaponCard('rope')] } : { ...p, hand: [roomCard('hall')] },
      ),
    }
    s = placeInRoom(s, 'p0', 'library')
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }])

    if (s.phase.kind !== 'suggestion_result') throw new Error('fase inattesa')
    expect(s.phase.disprovedBy).toBe('p2')
    expect(s.history.at(-1)?.passed).toEqual(['p1'])
  })

  it('chiede quale carta mostrare se ce ne sono piu di una', () => {
    let s = started(3)
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p1' ? { ...p, hand: [suspectCard('plum'), weaponCard('rope')] } : { ...p, hand: [] },
      ),
    }
    s = placeInRoom(s, 'p0', 'library')
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }])

    expect(s.phase.kind).toBe('resolving_suggestion')
    if (s.phase.kind !== 'resolving_suggestion') throw new Error('fase inattesa')
    expect(s.phase.awaitingFrom).toBe('p1')

    // Un altro giocatore non puo rispondere al posto suo.
    expect(reduce(s, { type: 'SHOW_CARD', playerId: 'p2', card: suspectCard('plum') }, 0).error).toBeTruthy()
    // Ne si puo mostrare una carta che non confuta.
    expect(reduce(s, { type: 'SHOW_CARD', playerId: 'p1', card: roomCard('hall') }, 0).error).toBeTruthy()

    s = run(s, [{ type: 'SHOW_CARD', playerId: 'p1', card: weaponCard('rope') }])
    if (s.phase.kind !== 'suggestion_result') throw new Error('fase inattesa')
    expect(s.phase.shownCard).toBe(weaponCard('rope'))
  })

  it('registra che nessuno ha potuto confutare', () => {
    let s = started(3)
    s = { ...s, players: s.players.map((p) => ({ ...p, hand: [] })) }
    s = placeInRoom(s, 'p0', 'library')
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }])
    if (s.phase.kind !== 'suggestion_result') throw new Error('fase inattesa')
    expect(s.phase.disprovedBy).toBeNull()
    expect(s.history.at(-1)?.passed).toEqual(['p1', 'p2'])
  })

  it('non permette due ipotesi nello stesso turno', () => {
    let s = started(3)
    // Una sola carta confutante in tutto il tavolo: l'esito e deterministico.
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p1' ? { ...p, hand: [suspectCard('plum')] } : { ...p, hand: [] },
      ),
    }
    s = placeInRoom(s, 'p0', 'library')
    s = run(s, [
      { type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' },
      { type: 'ACKNOWLEDGE', playerId: 'p0' },
    ])
    expect(s.phase).toEqual({ kind: 'in_room', room: 'library', canSuggest: false })
    const res = reduce(s, { type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'green', weapon: 'dagger' }, 0)
    expect(res.error).toMatch(/gia fatto un ipotesi/i)
  })

  it('non si puo ipotizzare fuori da una stanza', () => {
    const s = started(3)
    const res = reduce(s, { type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }, 0)
    expect(res.error).toMatch(/stanza/i)
  })

  it('chi viene trascinato puo ipotizzare senza tirare, al turno dopo', () => {
    let s = started(3)
    s = { ...s, players: s.players.map((p) => ({ ...p, hand: [] })) }
    s = placeInRoom(s, 'p0', 'library')
    // p0 (scarlett) trascina mustard, il personaggio di p1.
    s = run(s, [
      { type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'mustard', weapon: 'rope' },
      { type: 'ACKNOWLEDGE', playerId: 'p0' },
      { type: 'END_TURN', playerId: 'p0' },
    ])
    expect(currentPlayer(s)?.id).toBe('p1')
    expect(s.draggedBySuggestion).toContain('mustard')
    // Puo ipotizzare subito, senza passare da ROLL_DICE.
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p1', suspect: 'plum', weapon: 'dagger' }])
    expect(s.history.at(-1)?.suggestion.room).toBe('library')
  })
})

// ------------------------------------------------------------------- accusa

describe('accusa', () => {
  it('l accusa esatta chiude la partita', () => {
    const s = started(3)
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')
    const after = run(s, [{ type: 'MAKE_ACCUSATION', playerId: 'p0', ...sol }])
    expect(after.phase).toEqual({ kind: 'game_over', winnerId: 'p0', solution: sol })
  })

  it('l accusa sbagliata elimina ma lascia confutare', () => {
    const s = started(4)
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')
    const wrong = ROOM_IDS.find((r) => r !== sol.room) as string
    const after = run(s, [{ type: 'MAKE_ACCUSATION', playerId: 'p0', ...sol, room: wrong }])

    const p0 = after.players.find((p) => p.id === 'p0')
    expect(p0?.eliminated).toBe(true)
    expect(p0?.hasAccused).toBe(true)
    expect(after.phase.kind).toBe('awaiting_roll')
    expect(currentPlayer(after)?.id).toBe('p1')
    // Continua a mostrare le carte: la mano resta.
    expect(p0?.hand.length).toBeGreaterThan(0)
  })

  it('una sola accusa per giocatore', () => {
    const s = started(4)
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')
    const wrong = ROOM_IDS.find((r) => r !== sol.room) as string
    let after = run(s, [{ type: 'MAKE_ACCUSATION', playerId: 'p0', ...sol, room: wrong }])
    // Il turno e passato: riportiamolo a p0 per verificare il rifiuto.
    after = { ...after, turnIndex: 0 }
    const res = reduce(after, { type: 'MAKE_ACCUSATION', playerId: 'p0', ...sol }, 0)
    expect(res.error).toMatch(/gia usato/i)
  })

  it('quando resta un solo investigatore, vince lui', () => {
    let s = started(3)
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')
    const wrong = ROOM_IDS.find((r) => r !== sol.room) as string
    s = run(s, [{ type: 'MAKE_ACCUSATION', playerId: 'p0', ...sol, room: wrong }])
    s = run(s, [{ type: 'MAKE_ACCUSATION', playerId: 'p1', ...sol, room: wrong }])
    expect(s.phase.kind).toBe('game_over')
    if (s.phase.kind !== 'game_over') throw new Error('fase inattesa')
    expect(s.phase.winnerId).toBe('p2')
  })

  it('i giocatori eliminati vengono saltati nel giro dei turni', () => {
    let s = started(4)
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')
    const wrong = ROOM_IDS.find((r) => r !== sol.room) as string
    s = run(s, [{ type: 'MAKE_ACCUSATION', playerId: 'p0', ...sol, room: wrong }])
    expect(currentPlayer(s)?.id).toBe('p1')
    s = run(s, [{ type: 'END_TURN', playerId: 'p1' }])
    s = run(s, [{ type: 'END_TURN', playerId: 'p2' }])
    s = run(s, [{ type: 'END_TURN', playerId: 'p3' }])
    // Il giro riparte da p1: p0 e eliminato e viene saltato.
    expect(currentPlayer(s)?.id).toBe('p1')
  })
})

// ------------------------------------------------------------------ privacy

describe('redazione dello stato', () => {
  it('lo stato pubblico non contiene ne mani ne soluzione', () => {
    const s = started(4)
    const pub = toPublicState(s)
    const raw = JSON.stringify(pub)
    expect(pub.solution).toBeNull()
    for (const p of s.players) {
      for (const card of p.hand) expect(raw).not.toContain(card)
    }
    expect(pub.players[0]).toHaveProperty('handCount')
    expect(pub.players[0]).not.toHaveProperty('hand')
  })

  it('non trapela la carta mostrata nella fase di risultato', () => {
    let s = started(3)
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p1' ? { ...p, hand: [suspectCard('plum')] } : { ...p, hand: [] },
      ),
    }
    s = placeInRoom(s, 'p0', 'library')
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }])

    const pub = toPublicState(s)
    if (pub.phase.kind !== 'suggestion_result') throw new Error('fase inattesa')
    expect(pub.phase.shownCard).toBeNull()
    expect(JSON.stringify(pub)).not.toContain('Carta mostrata')

    // Chi ha ipotizzato la vede, gli altri no.
    expect(toPrivateState(s, 'p0').reveal?.card).toBe(suspectCard('plum'))
    expect(toPrivateState(s, 'p2').reveal).toBeNull()
  })

  it('rivela la soluzione solo a partita finita', () => {
    const s = started(3)
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')
    expect(toPublicState(s).solution).toBeNull()
    const end = run(s, [{ type: 'MAKE_ACCUSATION', playerId: 'p0', ...sol }])
    expect(toPublicState(end).solution).toEqual(sol)
  })

  it('la vista privata contiene solo la propria mano', () => {
    const s = started(4)
    const priv = toPrivateState(s, 'p2')
    const p2 = s.players.find((p) => p.id === 'p2')
    expect(priv.hand).toEqual(p2?.hand)
  })
})

// ----------------------------------------------------------------- taccuino

describe('taccuino deduttivo', () => {
  it('marca come mie le carte in mano e non degli altri', () => {
    const s = started(3)
    const hand = [suspectCard('plum'), weaponCard('rope')]
    const notes = computeNotes(notesContext(s), { viewerId: 'p0', hand, seen: {}, manual: {} })
    expect(notes.grid.p0?.[suspectCard('plum')]).toBe('has')
    expect(notes.grid.p1?.[suspectCard('plum')]).toBe('not')
    expect(notes.grid[ENVELOPE]?.[suspectCard('plum')]).toBe('not')
  })

  it('deduce la soluzione quando nessuno puo confutare', () => {
    // Distribuzione reale: le mani hanno la dimensione attesa, condizione
    // necessaria perche la deduzione possa chiudere il ragionamento.
    let s = started(3)
    const sol = s.solution
    if (!sol) throw new Error('soluzione mancante')

    // p0 ipotizza esattamente la soluzione: per costruzione nessuno confuta.
    s = placeInRoom(s, 'p0', sol.room)
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: sol.suspect, weapon: sol.weapon }])
    expect(s.history.at(-1)?.disprovedBy).toBeNull()
    expect(s.history.at(-1)?.passed).toEqual(['p1', 'p2'])

    const hand = s.players.find((p) => p.id === 'p0')?.hand ?? []
    const notes = computeNotes(notesContext(s), { viewerId: 'p0', hand, seen: {}, manual: {} })

    // Nessuno ha confutato: ne p1 ne p2 hanno le tre carte nominate.
    for (const pid of ['p1', 'p2']) {
      expect(notes.grid[pid]?.[suspectCard(sol.suspect)]).toBe('not')
      expect(notes.grid[pid]?.[weaponCard(sol.weapon)]).toBe('not')
      expect(notes.grid[pid]?.[roomCard(sol.room)]).toBe('not')
    }
    // ...e nemmeno p0, che conosce la propria mano: sono nella busta.
    expect(notes.solved).toEqual(sol)
  })

  it('risolve il vincolo quando resta una sola carta possibile', () => {
    let s = started(3)
    s = { ...s, players: s.players.map((p) => ({ ...p, hand: [] })) }
    s = placeInRoom(s, 'p0', 'library')
    s = run(s, [{ type: 'MAKE_SUGGESTION', playerId: 'p0', suspect: 'plum', weapon: 'rope' }])
    // Forziamo lo storico: p1 ha confutato, ma p2 (che ha passato) no.
    const rec = s.history.at(-1)
    if (!rec) throw new Error('storico vuoto')
    s = { ...s, history: [{ ...rec, passed: [], disprovedBy: 'p1' }] }

    // Chi guarda e p2 e sa gia di avere plum e rope: resta solo la biblioteca.
    const notes = computeNotes(notesContext(s), {
      viewerId: 'p2',
      hand: [suspectCard('plum'), weaponCard('rope')],
      seen: {},
      manual: {},
    })
    expect(notes.grid.p1?.[roomCard('library')]).toBe('has')
  })

  it('i segni manuali non sovrascrivono le deduzioni certe', () => {
    const s = started(3)
    const hand = [suspectCard('plum')]
    const notes = computeNotes(notesContext(s), {
      viewerId: 'p0',
      hand,
      seen: {},
      manual: { p0: { [suspectCard('plum')]: 'not' }, p1: { [weaponCard('rope')]: 'maybe' } },
    })
    expect(notes.grid.p0?.[suspectCard('plum')]).toBe('has')
    expect(notes.locked.p0?.[suspectCard('plum')]).toBe(true)
    expect(notes.grid.p1?.[weaponCard('rope')]).toBe('maybe')
  })

  it('calcola le dimensioni delle mani anche quando sono diseguali', () => {
    const s = started(4)
    const sizes = expectedHandSizes(notesContext(s))
    expect([...sizes.values()].reduce((a, b) => a + b, 0)).toBe(18)
    for (const p of s.players) expect(sizes.get(p.id)).toBe(p.hand.length)
  })
})

// ------------------------------------------------------- partita completa

describe('partita completa', () => {
  it('gioca 200 turni casuali senza mai entrare in uno stato illegale', () => {
    let s = started(4, 2024)
    let rng = createRng(777)
    const pick = <T>(items: readonly T[]): T | undefined => {
      if (items.length === 0) return undefined
      const [i, ns] = [Math.floor((rollDie(rng)[0] * items.length) / 7), rollDie(rng)[1]]
      rng = ns
      return items[Math.min(i, items.length - 1)]
    }

    for (let turn = 0; turn < 200 && s.phase.kind !== 'game_over'; turn++) {
      const p = currentPlayer(s)
      if (!p) break

      switch (s.phase.kind) {
        case 'awaiting_roll': {
          const res = reduce(s, { type: 'ROLL_DICE', playerId: p.id }, turn)
          expect(res.error).toBeNull()
          s = res.state
          break
        }
        case 'moving': {
          const moves = legalMoves(s)
          const rooms = [...(moves?.rooms.keys() ?? [])]
          const corridors = [...(moves?.corridors.keys() ?? [])]
          if (rooms.length > 0) {
            const room = pick(rooms) as string
            s = run(s, [{ type: 'MOVE_TO', playerId: p.id, target: { kind: 'room', room } }])
          } else if (corridors.length > 0) {
            const k = pick(corridors) as string
            const [c, r] = k.split(',').map(Number)
            s = run(s, [
              {
                type: 'MOVE_TO',
                playerId: p.id,
                target: { kind: 'corridor', at: { c: c as number, r: r as number } },
              },
            ])
          } else {
            s = run(s, [{ type: 'END_TURN', playerId: p.id }])
          }
          break
        }
        case 'in_room': {
          if (s.phase.canSuggest) {
            s = run(s, [
              {
                type: 'MAKE_SUGGESTION',
                playerId: p.id,
                suspect: pick(SUSPECT_IDS) as string,
                weapon: pick(WEAPON_IDS) as string,
              },
            ])
          } else {
            s = run(s, [{ type: 'END_TURN', playerId: p.id }])
          }
          break
        }
        case 'resolving_suggestion': {
          const who = s.phase.awaitingFrom
          if (!who) throw new Error('coda bloccata senza destinatario')
          const priv = toPrivateState(s, who)
          expect(priv.mustShowFrom.length).toBeGreaterThan(1)
          s = run(s, [{ type: 'SHOW_CARD', playerId: who, card: priv.mustShowFrom[0] as string }])
          break
        }
        case 'suggestion_result': {
          s = run(s, [{ type: 'ACKNOWLEDGE', playerId: s.phase.suggesterId }])
          break
        }
        default:
          break
      }

      // Invarianti globali, controllate a ogni passo.
      const cards = s.players.flatMap((x) => x.hand)
      expect(new Set(cards).size).toBe(cards.length)
      expect(cards).toHaveLength(18)
      for (const pos of Object.values(s.positions)) {
        if (pos.kind === 'corridor') {
          expect(board.isWalkableCorridor(pos.at.c, pos.at.r)).toBe(true)
        }
      }
      // Due pedine non possono mai stare sulla stessa casella di corridoio.
      const occupied = Object.values(s.positions)
        .filter((x) => x.kind === 'corridor')
        .map((x) => (x.kind === 'corridor' ? coordKey(x.at) : ''))
      expect(new Set(occupied).size).toBe(occupied.length)
    }
  })
})
