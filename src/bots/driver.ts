import { toPrivateState, toPublicState } from '@/engine/redact'
import { createRng } from '@/engine/rng'
import type { Action } from '@/engine/actions'
import type { GameState, Player } from '@/engine/types'
import { PROFILES, decide, emptyMemory, type BotDecision, type BotMemory } from './policy'

/**
 * IL DRIVER — l'unico punto in cui i bot toccano la partita.
 *
 * Sta sull'host (la TV) perche li c'e l'unica copia autorevole dello stato, ma
 * non ha alcun privilegio: produce `Action` identiche a quelle di un telefono e
 * le fa passare dallo stesso `reduce`. Se un bot tentasse una mossa illegale,
 * verrebbe respinto come chiunque altro.
 *
 * ONESTA PER COSTRUZIONE. Il driver possiede il `GameState` completo, ma
 * `decide()` non lo riceve mai: gli passa `toPublicState(game)` e
 * `toPrivateState(game, botId)`, cioe esattamente i due oggetti che arrivano al
 * telefono di quel giocatore. Non e una promessa scritta in un commento — e la
 * firma della funzione, ed e verificata da un test che rompe se qualcuno un
 * giorno passasse lo stato intero per comodita.
 */

export type BotMemories = Record<string, BotMemory>

export interface BotTurn {
  readonly playerId: string
  readonly action: Action
  readonly rationale: string
  /** Memoria aggiornata dopo questa decisione. */
  readonly memories: BotMemories
  /** Sintesi della credenza, per il log e la diagnostica. */
  readonly confidence: number
}

/** Hash stabile di una stringa: serve solo a separare i flussi casuali. */
function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Flusso casuale privato di un bot.
 *
 * Deriva dal seed della partita, ma NON consuma l'RNG del gioco: se i bot
 * pescassero dallo stesso flusso dei dadi, aggiungere un bot cambierebbe i tiri
 * di tutti e la partita non sarebbe piu rigiocabile. Cambia a ogni turno, cosi
 * un bot non ripete la stessa scelta arbitraria in situazioni identiche.
 */
const botRng = (game: GameState, botId: string) =>
  createRng((game.rng.seed ^ hashString(botId) ^ (game.turnNumber * 0x9e3779b9)) >>> 0)

/** Il bot che deve muoversi adesso, se ce n'e uno. */
export function botOnTheClock(game: GameState): Player | null {
  const phase = game.phase
  if (phase.kind === 'lobby' || phase.kind === 'game_over') return null

  if (phase.kind === 'resolving_suggestion' && phase.awaitingFrom) {
    const waiting = game.players.find((p) => p.id === phase.awaitingFrom)
    return waiting?.bot ? waiting : null
  }
  if (phase.kind === 'suggestion_result') {
    const suggester = game.players.find((p) => p.id === phase.suggesterId)
    return suggester?.bot ? suggester : null
  }

  const suspect = game.turnOrder[game.turnIndex % game.turnOrder.length]
  const current = suspect ? game.players.find((p) => p.suspect === suspect) : undefined
  return current?.bot && !current.eliminated ? current : null
}

/**
 * Aggiorna la memoria di un bot con cio che ha appena visto.
 *
 * Legge solo dalla vista privata: la carta mostrata a lui e chi gliel'ha
 * mostrata. E la stessa informazione che il telefono di un umano accumula nel
 * proprio taccuino.
 */
function rememberReveal(game: GameState, bot: Player, memories: BotMemories): BotMemories {
  const priv = toPrivateState(game, bot.id)
  if (!priv.reveal) return memories
  const current = memories[bot.id] ?? emptyMemory()
  if (current.seen[priv.reveal.card] === priv.reveal.fromPlayerId) return memories
  return {
    ...memories,
    [bot.id]: {
      ...current,
      seen: { ...current.seen, [priv.reveal.card]: priv.reveal.fromPlayerId },
    },
  }
}

/** Registra una carta che il bot ha appena mostrato, per non regalarne altre. */
function rememberShown(memories: BotMemories, botId: string, askerId: string, card: string): BotMemories {
  const current = memories[botId] ?? emptyMemory()
  const already = current.shown[askerId] ?? []
  if (already.includes(card)) return memories
  return {
    ...memories,
    [botId]: { ...current, shown: { ...current.shown, [askerId]: [...already, card] } },
  }
}

/**
 * Calcola la prossima mossa di un bot, se e il suo momento.
 *
 * Restituisce `null` quando non c'e nulla da fare — tocca a un umano, la
 * partita e in lobby o e finita. Chi chiama si limita a inoltrare l'azione.
 */
export function nextBotTurn(game: GameState, memories: BotMemories): BotTurn | null {
  const bot = botOnTheClock(game)
  if (!bot?.bot) return null

  // Prima si guarda, poi si decide: una carta appena mostrata deve entrare
  // nella memoria PRIMA che il modello probabilistico venga ricalcolato.
  const updated = rememberReveal(game, bot, memories)
  const memory = updated[bot.id] ?? emptyMemory()

  const decision: BotDecision | null = decide({
    // Le due sole finestre del bot sul mondo.
    pub: toPublicState(game),
    priv: toPrivateState(game, bot.id),
    memory,
    profile: PROFILES[bot.bot],
    rng: botRng(game, bot.id),
  })

  if (!decision) return null

  let memories2 = updated
  if (decision.action.type === 'SHOW_CARD' && game.phase.kind === 'resolving_suggestion') {
    memories2 = rememberShown(memories2, bot.id, game.phase.suggesterId, decision.action.card as string)
  }

  return {
    playerId: bot.id,
    action: decision.action,
    rationale: decision.rationale,
    memories: memories2,
    confidence: decision.belief.bestSolution.p,
  }
}

/** Pausa fra una mossa di bot e la successiva, perche il tavolo possa seguire. */
export function botDelay(action: Action): number {
  switch (action.type) {
    case 'ROLL_DICE':
      return 1100
    case 'MOVE_TO':
      return 1400
    case 'MAKE_SUGGESTION':
      return 1600
    case 'SHOW_CARD':
      return 1500
    case 'ACKNOWLEDGE':
      return 1800
    case 'MAKE_ACCUSATION':
      return 2200
    default:
      return 1000
  }
}
