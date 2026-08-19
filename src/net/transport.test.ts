// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalTransport } from './localTransport'
import type { Action } from '@/engine/actions'
import { reduce } from '@/engine/reducer'
import { createGame } from '@/engine/setup'
import { toPrivateState, toPublicState } from '@/engine/redact'
import type { PrivateState, PublicState } from '@/engine/redact'
import type { GameState } from '@/engine/types'
import { SUSPECT_IDS } from '@/engine/constants'

/**
 * Test d'integrazione del giro completo telefono -> host -> telefono.
 *
 * Gira in ambiente Node perche jsdom non implementa BroadcastChannel, mentre
 * Node 22 si. Verifica il pezzo che i test del motore non toccano: che gli
 * intenti arrivino, che l'host sia l'unica autorita e — soprattutto — che
 * sul canale pubblico non passi mai una carta.
 */

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

interface Harness {
  readonly host: LocalTransport
  readonly clients: readonly LocalTransport[]
  readonly received: PublicState[]
  readonly privates: Map<string, PrivateState[]>
  readonly errors: string[]
  game: GameState
}

let room = 0

async function makeHarness(playerIds: readonly string[]): Promise<Harness> {
  room += 1
  const roomCode = `T${room}`.padEnd(6, 'X')

  const received: PublicState[] = []
  const privates = new Map<string, PrivateState[]>()
  const errors: string[] = []

  const harness = { received, privates, errors } as unknown as Harness
  let game = createGame({ roomCode, seed: 1234 })

  const publish = (state: GameState, only?: string): void => {
    host.publishState(toPublicState(state))
    for (const p of state.players) {
      if (only && p.id !== only) continue
      host.publishPrivate(p.id, toPrivateState(state, p.id))
    }
  }

  const host = new LocalTransport({
    roomCode,
    role: 'host',
    events: {
      onIntent: (action: Action) => {
        const res = reduce(game, action, 0)
        if (res.error) {
          const pid = 'playerId' in action ? action.playerId : null
          if (pid) host.publishError(pid, res.error)
          return
        }
        game = res.state
        ;(harness as { game: GameState }).game = game
        publish(game)
      },
      onSync: (playerId) => publish(game, playerId),
    },
  })
  await host.connect()

  const clients: LocalTransport[] = []
  for (const id of playerIds) {
    privates.set(id, [])
    const client = new LocalTransport({
      roomCode,
      role: 'client',
      events: {
        onPublicState: (s) => received.push(s),
        onPrivateState: (s) => privates.get(id)?.push(s),
        onError: (m) => errors.push(m),
      },
    })
    await client.identify(id)
    await client.connect()
    clients.push(client)
  }

  Object.assign(harness, { host, clients, game })
  return harness
}

describe('giro completo telefono - host - telefono', () => {
  let h: Harness

  beforeEach(async () => {
    h = await makeHarness(['a', 'b', 'c'])
  })

  it('un intento del telefono cambia lo stato sull host e torna a tutti', async () => {
    h.clients[0]?.sendIntent({ type: 'JOIN', playerId: 'a', name: 'Ada', suspect: SUSPECT_IDS[0] as string })
    await tick()

    expect(h.game.players.map((p) => p.name)).toEqual(['Ada'])
    const last = h.received.at(-1)
    expect(last?.players[0]?.name).toBe('Ada')
  })

  it('una mossa illegale non muove lo stato e torna solo al mittente', async () => {
    h.clients[0]?.sendIntent({ type: 'ROLL_DICE', playerId: 'a' })
    await tick()

    expect(h.game.phase.kind).toBe('lobby')
    expect(h.errors.length).toBeGreaterThan(0)
  })

  it('sul canale pubblico non passa mai una carta', async () => {
    for (const [i, id] of ['a', 'b', 'c'].entries()) {
      h.clients[i]?.sendIntent({ type: 'JOIN', playerId: id, name: id, suspect: SUSPECT_IDS[i] as string })
      await tick()
    }
    h.clients[0]?.sendIntent({ type: 'START_GAME' })
    await tick()

    expect(h.game.solution).not.toBeNull()

    // Tutte le carte distribuite, cercate in ogni stato pubblico trasmesso.
    const allCards = h.game.players.flatMap((p) => p.hand)
    expect(allCards).toHaveLength(18)

    const wire = JSON.stringify(h.received)
    for (const card of allCards) {
      expect(wire, `la carta ${card} e comparsa sul canale pubblico`).not.toContain(card)
    }
    // Nemmeno la soluzione.
    const sol = h.game.solution
    expect(wire).not.toContain(`"suspect":"${sol?.suspect}","weapon":"${sol?.weapon}"`)
  })

  it('ogni telefono riceve solo la propria mano', async () => {
    for (const [i, id] of ['a', 'b', 'c'].entries()) {
      h.clients[i]?.sendIntent({ type: 'JOIN', playerId: id, name: id, suspect: SUSPECT_IDS[i] as string })
      await tick()
    }
    h.clients[0]?.sendIntent({ type: 'START_GAME' })
    await tick()

    for (const player of h.game.players) {
      const mine = h.privates.get(player.id)?.at(-1)
      expect(mine?.hand).toEqual(player.hand)

      // Le mani altrui non sono mai arrivate a questo telefono.
      const others = h.game.players.filter((p) => p.id !== player.id).flatMap((p) => p.hand)
      const wire = JSON.stringify(h.privates.get(player.id))
      for (const card of others) {
        if (player.hand.includes(card)) continue
        expect(wire, `${player.id} ha ricevuto ${card}, che non e suo`).not.toContain(card)
      }
    }
  })

  it('una richiesta di sync ritrasmette lo stato a chi si riconnette', async () => {
    h.clients[0]?.sendIntent({ type: 'JOIN', playerId: 'a', name: 'Ada', suspect: SUSPECT_IDS[0] as string })
    await tick()
    const before = h.received.length

    h.clients[0]?.requestSync('a')
    await tick()

    expect(h.received.length).toBeGreaterThan(before)
    expect(h.received.at(-1)?.players[0]?.name).toBe('Ada')
  })
})
