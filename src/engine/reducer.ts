import { produce, type Draft } from 'immer'
import type { Action } from './actions'
import { ROOM_BY_ID, SUSPECT_BY_ID, WEAPON_BY_ID } from './constants'
import type { RoomId, SuspectId, WeaponId } from './constants'
import { coordKey, corridorAt, inRoom, reachable, secretPassageFrom } from './board'
import type { Position } from './board'
import { cardLabel, matchingCards } from './cards'
import { dealCards, placeWeapons, seatedTurnOrder } from './setup'
import { rollDie } from './rng'
import type { CardKey, GameState, LogEntry, Player, Solution, Suggestion, SuggestionRecord } from './types'

/**
 * Dentro `produce` immer consegna una bozza mutabile: gli helper interni
 * lavorano su questi alias, mentre l'API pubblica resta immutabile.
 */
type GameDraft = Draft<GameState>
type PlayerDraft = Draft<Player>

const draftPlayerById = (d: GameDraft, id: string): PlayerDraft | undefined =>
  d.players.find((p) => p.id === id)

const draftCurrentPlayer = (d: GameDraft): PlayerDraft | undefined => {
  if (d.turnOrder.length === 0) return undefined
  const suspect = d.turnOrder[d.turnIndex % d.turnOrder.length]
  return suspect ? d.players.find((p) => p.suspect === suspect && !p.isNpc) : undefined
}

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 6

export interface ReduceResult {
  readonly state: GameState
  /** Motivo del rifiuto, da rimandare al telefono che ha inviato l'intento. */
  readonly error: string | null
}

// ---------------------------------------------------------------- helper

export const playerById = (s: GameState, id: string): Player | undefined => s.players.find((p) => p.id === id)

export const currentSuspect = (s: GameState): SuspectId | null =>
  s.turnOrder.length === 0 ? null : (s.turnOrder[s.turnIndex % s.turnOrder.length] ?? null)

export const currentPlayer = (s: GameState): Player | undefined => {
  const suspect = currentSuspect(s)
  return suspect ? s.players.find((p) => p.suspect === suspect && !p.isNpc) : undefined
}

export const isCurrentPlayer = (s: GameState, playerId: string): boolean => currentPlayer(s)?.id === playerId

export const positionRoom = (pos: Position): RoomId | null => (pos.kind === 'room' ? pos.room : null)

/** Caselle di corridoio occupate: bloccano sia il transito sia l'arrivo. */
function occupiedCorridors(s: GameState, except: SuspectId): Set<string> {
  const out = new Set<string>()
  for (const [suspect, pos] of Object.entries(s.positions) as [SuspectId, Position][]) {
    if (suspect === except) continue
    if (pos.kind === 'corridor') out.add(coordKey(pos.at))
  }
  return out
}

let logCounter = 0
function pushLog(draft: GameDraft, entry: Omit<LogEntry, 'id' | 'turn'>): void {
  logCounter += 1
  const log = draft.log
  log.push({
    ...entry,
    privateTo: entry.privateTo ? [...entry.privateTo] : undefined,
    id: 'l' + log.length + '_' + logCounter,
    turn: draft.turnNumber,
  })
  if (log.length > 300) log.splice(0, log.length - 300)
}

const describe = (s: Solution): string =>
  SUSPECT_BY_ID[s.suspect].name + ', ' + ROOM_BY_ID[s.room].name + ', ' + WEAPON_BY_ID[s.weapon].name

/**
 * Il giocatore puo ipotizzare senza tirare i dadi?
 * Vale solo se e stato trascinato in una stanza dall'ipotesi di un altro
 * giocatore e la regola opzionale e attiva.
 */
export function canSuggestWithoutRolling(s: GameState, player: Player): boolean {
  if (!s.config.suggestionMoveGrantsSuggestion) return false
  if (s.phase.kind !== 'awaiting_roll') return false
  if (!s.draggedBySuggestion.includes(player.suspect)) return false
  return s.positions[player.suspect]?.kind === 'room'
}

/** Coda di confutazione: in senso orario a partire da chi ha ipotizzato. */
function buildDisproveQueue(s: GameState, suggesterId: string): string[] {
  const humans = s.players.filter((p) => !p.isNpc)
  const order = s.turnOrder
    .map((suspect) => humans.find((p) => p.suspect === suspect))
    .filter((p): p is Player => Boolean(p))
  const start = order.findIndex((p) => p.id === suggesterId)
  if (start < 0) return []
  const queue: string[] = []
  for (let i = 1; i < order.length; i++) {
    const p = order[(start + i) % order.length]
    if (p) queue.push(p.id)
  }
  return queue
}

function revealCard(
  draft: GameDraft,
  suggestion: Suggestion,
  suggesterId: string,
  shower: PlayerDraft,
  card: CardKey,
): void {
  const suggester = draftPlayerById(draft, suggesterId)
  pushLog(draft, {
    kind: 'disprove',
    actorId: shower.id,
    text: shower.name + ' confuta mostrando una carta a ' + (suggester?.name ?? '?') + '.',
    privateTo: [suggesterId, shower.id],
    privateText: 'Carta mostrata: ' + cardLabel(card) + '.',
  })
  closeRecord(draft, shower.id)
  draft.phase = {
    kind: 'suggestion_result',
    suggestion,
    suggesterId,
    disprovedBy: shower.id,
    shownCard: card,
  }
}

/** Chiude lo storico dell'ipotesi in corso indicando chi l'ha confutata. */
function closeRecord(draft: GameDraft, disprovedBy: string | null): void {
  const rec = draft.history[draft.history.length - 1]
  if (rec) rec.disprovedBy = disprovedBy
}

/** Segna che un giocatore ha dichiarato di non poter confutare. */
function recordPass(draft: GameDraft, playerId: string): void {
  const rec = draft.history[draft.history.length - 1]
  if (rec && !rec.passed.includes(playerId)) rec.passed.push(playerId)
}

/**
 * Avanza la coda finche non trova qualcuno che deve confutare.
 * Chi non ha carte in mano passa automaticamente: e informazione pubblica,
 * visibile a tutti anche al tavolo reale.
 */
function advanceDisprove(
  draft: GameDraft,
  suggestion: Suggestion,
  suggesterId: string,
  queue: readonly string[],
  from: number,
): void {
  for (let i = from; i < queue.length; i++) {
    const pid = queue[i]
    if (!pid) continue
    const p = draftPlayerById(draft, pid)
    if (!p) continue
    const matches = matchingCards(p.hand, suggestion)
    if (matches.length === 0) {
      recordPass(draft, p.id)
      pushLog(draft, { kind: 'disprove', actorId: p.id, text: p.name + ' non puo confutare.' })
      continue
    }
    if (matches.length === 1) {
      // Una sola carta possibile: mostrarla e obbligatorio, nessuna scelta.
      revealCard(draft, suggestion, suggesterId, p, matches[0] as CardKey)
      return
    }
    draft.phase = {
      kind: 'resolving_suggestion',
      suggestion,
      suggesterId,
      queue: [...queue],
      cursor: i,
      awaitingFrom: p.id,
    }
    return
  }
  closeRecord(draft, null)
  pushLog(draft, {
    kind: 'disprove',
    actorId: suggesterId,
    text: 'Nessuno puo confutare questa ipotesi. Un indizio pesante.',
  })
  draft.phase = { kind: 'suggestion_result', suggestion, suggesterId, disprovedBy: null, shownCard: null }
}

/** Passa il turno al giocatore successivo non eliminato. */
function nextTurn(draft: GameDraft): void {
  const humans = draft.players.filter((p) => !p.isNpc)
  const alive = humans.filter((p) => !p.eliminated)

  if (alive.length === 0) {
    draft.phase = { kind: 'game_over', winnerId: null, solution: draft.solution as Solution }
    return
  }
  if (alive.length === 1 && humans.length > 1) {
    const winner = alive[0] as PlayerDraft
    pushLog(draft, {
      kind: 'system',
      actorId: winner.id,
      text: winner.name + ' resta l unico investigatore in gioco e vince a tavolino.',
    })
    draft.phase = { kind: 'game_over', winnerId: winner.id, solution: draft.solution as Solution }
    return
  }

  draft.leftRoomThisTurn = null
  draft.lastPath = []
  for (let i = 0; i < draft.turnOrder.length; i++) {
    draft.turnIndex = (draft.turnIndex + 1) % draft.turnOrder.length
    const p = draftCurrentPlayer(draft)
    if (p && !p.eliminated) break
  }
  draft.turnNumber += 1
  draft.phase = { kind: 'awaiting_roll' }

  const p = draftCurrentPlayer(draft)
  if (p) {
    pushLog(draft, {
      kind: 'system',
      actorId: p.id,
      text: 'Tocca a ' + p.name + ' (' + SUSPECT_BY_ID[p.suspect].name + ').',
    })
  }
}

// ---------------------------------------------------------------- reducer

/**
 * Riduttore puro: (stato, azione) -> stato.
 *
 * La TV host e l unica autorita. Ogni intento in arrivo dai telefoni passa da
 * qui: se la mossa e illegale lo stato non cambia e torna un errore da
 * rimandare al mittente.
 */
export function reduce(state: GameState, action: Action, now = 0): ReduceResult {
  let error: string | null = null
  const fail = (msg: string): void => {
    error = msg
  }

  const next = produce(state, (draft) => {
    draft.updatedAt = now

    switch (action.type) {
      // ------------------------------------------------------------ lobby
      case 'JOIN': {
        const existing = draftPlayerById(draft, action.playerId)
        if (draft.phase.kind !== 'lobby') {
          if (existing) existing.connected = true
          else fail('La partita e gia iniziata.')
          return
        }
        if (existing) {
          existing.name = action.name
          existing.connected = true
          if (existing.suspect !== action.suspect) {
            if (draft.players.some((p) => p.suspect === action.suspect && p.id !== action.playerId)) {
              fail('Personaggio gia scelto da un altro giocatore.')
              return
            }
            existing.suspect = action.suspect as SuspectId
          }
          return
        }
        if (draft.players.length >= MAX_PLAYERS) {
          fail('Partita al completo: massimo ' + MAX_PLAYERS + ' giocatori.')
          return
        }
        if (draft.players.some((p) => p.suspect === action.suspect)) {
          fail('Personaggio gia scelto da un altro giocatore.')
          return
        }
        const player: PlayerDraft = {
          id: action.playerId,
          name: action.name,
          suspect: action.suspect as SuspectId,
          isNpc: false,
          connected: true,
          eliminated: false,
          hasAccused: false,
          hand: [],
        }
        draft.players.push(player)
        pushLog(draft, {
          kind: 'system',
          actorId: player.id,
          text: player.name + ' entra nella magione come ' + SUSPECT_BY_ID[player.suspect].name + '.',
        })
        return
      }

      case 'RENAME': {
        const p = draftPlayerById(draft, action.playerId)
        if (!p) return fail('Giocatore sconosciuto.')
        p.name = action.name
        return
      }

      case 'SET_CONNECTED': {
        const p = draftPlayerById(draft, action.playerId)
        if (p) p.connected = action.connected
        return
      }

      case 'LEAVE': {
        if (draft.phase.kind !== 'lobby') {
          // A partita iniziata la pedina resta sul tabellone: il giocatore
          // puo riconnettersi con lo stesso id.
          const p = draftPlayerById(draft, action.playerId)
          if (p) p.connected = false
          return
        }
        draft.players = draft.players.filter((p) => p.id !== action.playerId)
        return
      }

      case 'SET_CONFIG': {
        if (draft.phase.kind !== 'lobby') return fail('Le impostazioni si cambiano solo prima di iniziare.')
        Object.assign(draft.config, action.config)
        if (action.config.classicWeaponPlacement !== undefined) {
          const [weapons, rng] = placeWeapons(draft.rng, action.config.classicWeaponPlacement)
          draft.weapons = weapons
          draft.rng = rng
        }
        return
      }

      case 'START_GAME': {
        if (draft.phase.kind !== 'lobby') return fail('La partita e gia iniziata.')
        const humans = draft.players.filter((p) => !p.isNpc)
        if (humans.length < MIN_PLAYERS) return fail('Servono almeno ' + MIN_PLAYERS + ' giocatori.')

        draft.turnOrder = seatedTurnOrder(draft.players)
        const ordered = draft.turnOrder
          .map((s) => humans.find((p) => p.suspect === s))
          .filter((p): p is PlayerDraft => Boolean(p))

        const deal = dealCards(ordered.length, draft.rng)
        draft.rng = deal.rng
        draft.solution = deal.solution
        ordered.forEach((p, i) => {
          const target = draftPlayerById(draft, p.id)
          if (target) target.hand = [...(deal.hands[i] ?? [])]
        })

        draft.turnIndex = 0
        draft.turnNumber = 1
        draft.startedAt = now
        draft.phase = { kind: 'awaiting_roll' }
        pushLog(draft, {
          kind: 'system',
          actorId: null,
          text: 'Il delitto e servito. ' + ordered.length + ' investigatori a Tudor Mansion.',
        })
        const first = draftCurrentPlayer(draft)
        if (first) pushLog(draft, { kind: 'system', actorId: first.id, text: 'Inizia ' + first.name + '.' })
        return
      }

      // ------------------------------------------------------------ turno
      case 'ROLL_DICE': {
        if (draft.phase.kind !== 'awaiting_roll') return fail('Non e il momento di tirare i dadi.')
        if (!isCurrentPlayer(draft, action.playerId)) return fail('Non e il tuo turno.')
        const p = draftCurrentPlayer(draft)
        if (!p) return

        let rng = draft.rng
        const dice: number[] = []
        for (let i = 0; i < draft.config.diceCount; i++) {
          const [v, s] = rollDie(rng)
          rng = s
          dice.push(v)
        }
        draft.rng = rng
        const total = dice.reduce((a, b) => a + b, 0)

        // Uscire da una stanza vieta di rientrarci nello stesso turno.
        const here = draft.positions[p.suspect]
        draft.leftRoomThisTurn = here?.kind === 'room' ? here.room : null
        draft.draggedBySuggestion = draft.draggedBySuggestion.filter((s) => s !== p.suspect)

        draft.phase = { kind: 'moving', dice: [dice[0] ?? 0, dice[1] ?? 0] }
        pushLog(draft, { kind: 'move', actorId: p.id, text: p.name + ' tira i dadi: ' + total + '.' })
        return
      }

      case 'USE_SECRET_PASSAGE': {
        if (draft.phase.kind !== 'awaiting_roll') return fail('Il passaggio segreto si usa a inizio turno.')
        if (!isCurrentPlayer(draft, action.playerId)) return fail('Non e il tuo turno.')
        const p = draftCurrentPlayer(draft)
        if (!p) return
        const here = draft.positions[p.suspect]
        if (here?.kind !== 'room') return fail('Non sei in una stanza.')
        const dest = secretPassageFrom(here.room)
        if (!dest) return fail('Questa stanza non ha un passaggio segreto.')

        draft.positions[p.suspect] = inRoom(dest)
        draft.leftRoomThisTurn = here.room
        draft.lastPath = []
        draft.draggedBySuggestion = draft.draggedBySuggestion.filter((s) => s !== p.suspect)
        draft.phase = { kind: 'in_room', room: dest, canSuggest: true }
        pushLog(draft, {
          kind: 'passage',
          actorId: p.id,
          text: p.name + ' sparisce nel passaggio segreto e riemerge in ' + ROOM_BY_ID[dest].name + '.',
        })
        return
      }

      case 'MOVE_TO': {
        if (draft.phase.kind !== 'moving') return fail('Devi prima tirare i dadi.')
        if (!isCurrentPlayer(draft, action.playerId)) return fail('Non e il tuo turno.')
        const p = draftCurrentPlayer(draft)
        if (!p) return

        const dice = draft.phase.dice[0] + draft.phase.dice[1]
        const from = draft.positions[p.suspect] as Position
        const options = reachable(from, dice, {
          blocked: occupiedCorridors(draft, p.suspect),
          forbiddenRoom: draft.leftRoomThisTurn,
        })

        if (action.target.kind === 'room') {
          const room = action.target.room as RoomId
          const target = options.rooms.get(room)
          if (!target) return fail('Stanza non raggiungibile con questo tiro.')
          draft.positions[p.suspect] = inRoom(room)
          draft.lastPath = [...target.path]
          draft.phase = { kind: 'in_room', room, canSuggest: true }
          pushLog(draft, {
            kind: 'move',
            actorId: p.id,
            text: p.name + ' entra in ' + ROOM_BY_ID[room].name + '.',
          })
          return
        }

        const target = options.corridors.get(coordKey(action.target.at))
        if (!target) return fail('Casella non raggiungibile con questo tiro.')
        draft.positions[p.suspect] = corridorAt(action.target.at.c, action.target.at.r)
        draft.lastPath = [...target.path]
        pushLog(draft, { kind: 'move', actorId: p.id, text: p.name + ' avanza lungo il corridoio.' })
        nextTurn(draft)
        return
      }

      // ---------------------------------------------------------- ipotesi
      case 'MAKE_SUGGESTION': {
        const p = draftPlayerById(draft, action.playerId)
        if (!p) return fail('Giocatore sconosciuto.')
        if (!isCurrentPlayer(draft, action.playerId)) return fail('Non e il tuo turno.')

        const here = draft.positions[p.suspect]
        if (here?.kind !== 'room') return fail('Devi essere in una stanza per fare un ipotesi.')

        const allowed =
          (draft.phase.kind === 'in_room' && draft.phase.canSuggest) || canSuggestWithoutRolling(draft, p)
        if (!allowed) return fail('Hai gia fatto un ipotesi in questo turno.')

        const suggestion: Suggestion = {
          suspect: action.suspect as SuspectId,
          weapon: action.weapon as WeaponId,
          room: here.room,
        }

        // Il sospetto e l arma nominati vengono trascinati nella stanza.
        const dragged = suggestion.suspect
        const previous = draft.positions[dragged]
        const wasElsewhere = !(previous?.kind === 'room' && previous.room === here.room)
        draft.positions[dragged] = inRoom(here.room)
        draft.weapons[suggestion.weapon] = here.room

        const flags = draft.draggedBySuggestion
        if (dragged !== p.suspect && wasElsewhere && !flags.includes(dragged)) flags.push(dragged)
        draft.draggedBySuggestion = flags.filter((s) => s !== p.suspect)

        pushLog(draft, {
          kind: 'suggestion',
          actorId: p.id,
          text: p.name + ' ipotizza: ' + describe(suggestion) + '.',
        })

        const record: Draft<SuggestionRecord> = {
          id: 'h' + draft.history.length + '_' + draft.turnNumber,
          turn: draft.turnNumber,
          suggesterId: p.id,
          suggestion,
          passed: [],
          disprovedBy: null,
        }
        draft.history.push(record)

        const queue = buildDisproveQueue(draft, p.id)
        advanceDisprove(draft, suggestion, p.id, queue, 0)
        return
      }

      case 'SHOW_CARD': {
        if (draft.phase.kind !== 'resolving_suggestion') return fail('Nessuna ipotesi in corso.')
        if (draft.phase.awaitingFrom !== action.playerId) return fail('Non tocca a te confutare.')
        const p = draftPlayerById(draft, action.playerId)
        if (!p) return
        const card = action.card as CardKey
        if (!p.hand.includes(card)) return fail('Non hai questa carta.')
        if (!matchingCards(p.hand, draft.phase.suggestion).includes(card)) {
          return fail('Questa carta non confuta l ipotesi.')
        }
        revealCard(draft, draft.phase.suggestion, draft.phase.suggesterId, p, card)
        return
      }

      case 'ACKNOWLEDGE': {
        if (draft.phase.kind !== 'suggestion_result') return fail('Niente da confermare.')
        if (draft.phase.suggesterId !== action.playerId) return fail('Solo chi ha ipotizzato puo proseguire.')
        // Dopo un ipotesi si puo ancora accusare, ma non ipotizzare di nuovo.
        draft.phase = { kind: 'in_room', room: draft.phase.suggestion.room, canSuggest: false }
        return
      }

      // ----------------------------------------------------------- accusa
      case 'MAKE_ACCUSATION': {
        const p = draftPlayerById(draft, action.playerId)
        if (!p) return fail('Giocatore sconosciuto.')
        if (!isCurrentPlayer(draft, action.playerId)) return fail('Non e il tuo turno.')
        if (p.hasAccused) return fail('Hai gia usato la tua unica accusa.')

        const kind = draft.phase.kind
        if (kind !== 'awaiting_roll' && kind !== 'in_room' && kind !== 'moving') {
          return fail('Non puoi accusare in questo momento.')
        }
        const solution = draft.solution
        if (!solution) return

        const accusation: Solution = {
          suspect: action.suspect as SuspectId,
          weapon: action.weapon as WeaponId,
          room: action.room as RoomId,
        }
        p.hasAccused = true
        pushLog(draft, {
          kind: 'accusation',
          actorId: p.id,
          text: p.name + ' ACCUSA: ' + describe(accusation) + '!',
        })

        const correct =
          accusation.suspect === solution.suspect &&
          accusation.weapon === solution.weapon &&
          accusation.room === solution.room

        if (correct) {
          pushLog(draft, {
            kind: 'accusation',
            actorId: p.id,
            text: 'Esatto. ' + p.name + ' risolve il caso.',
          })
          draft.phase = { kind: 'game_over', winnerId: p.id, solution }
          return
        }

        p.eliminated = true
        pushLog(draft, {
          kind: 'accusation',
          actorId: p.id,
          text: 'Sbagliato. ' + p.name + ' e fuori dai giochi, ma continua a mostrare le carte.',
        })
        nextTurn(draft)
        return
      }

      case 'END_TURN': {
        if (!isCurrentPlayer(draft, action.playerId)) return fail('Non e il tuo turno.')
        if (draft.phase.kind === 'resolving_suggestion' || draft.phase.kind === 'suggestion_result') {
          return fail('Risolvi prima l ipotesi in corso.')
        }
        if (draft.phase.kind === 'game_over' || draft.phase.kind === 'lobby') return
        nextTurn(draft)
        return
      }

      case 'RESET':
        // Gestito dall host: ricrea la partita da zero, non e una transizione.
        return fail('RESET e gestito fuori dal reducer.')
    }
  })

  return error ? { state, error } : { state: next, error: null }
}

/** Le mosse legali per il giocatore di turno, ricalcolate dallo stato. */
export function legalMoves(s: GameState): ReturnType<typeof reachable> | null {
  if (s.phase.kind !== 'moving') return null
  const p = currentPlayer(s)
  if (!p) return null
  const from = s.positions[p.suspect] as Position
  return reachable(from, s.phase.dice[0] + s.phase.dice[1], {
    blocked: occupiedCorridors(s, p.suspect),
    forbiddenRoom: s.leftRoomThisTurn,
  })
}
