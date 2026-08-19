import { ROOM_BY_ID, ROOM_IDS, SUSPECT_IDS, WEAPON_IDS } from '@/engine/constants'
import type { RoomId, SuspectId, WeaponId } from '@/engine/constants'
import { coordKey, distance, inRoom, reachable, secretPassageFrom } from '@/engine/board'
import type { Coord, Position } from '@/engine/board'
import { roomCard, suspectCard, weaponCard } from '@/engine/cards'
import { ENVELOPE, notesContext } from '@/engine/notes'
import { nextInt, type RngState } from '@/engine/rng'
import type { Action } from '@/engine/actions'
import type { BotLevel, CardKey, Solution } from '@/engine/types'
import type { PrivateState, PublicState } from '@/engine/redact'
import { computeBelief, type Belief, type HolderId } from './belief'

/**
 * LA POLITICA DI GIOCO
 *
 * Il modello probabilistico dice al bot cosa crede; questo file decide cosa
 * farne. Tutto algoritmico e deterministico: nessun modello addestrato, nessuna
 * chiamata esterna, solo conteggi sui mondi coerenti gia campionati.
 *
 * L'idea che regge le scelte e una sola: **il valore di una mossa e quanta
 * incertezza toglie**. Un'ipotesi che si sa gia come finira non insegna nulla,
 * anche se nomina la carta "giusta". La domanda buona non e "chi sospetto?", e
 * "quale domanda divide meglio i mondi ancora possibili?".
 *
 * I livelli non cambiano cosa il bot puo vedere — quello e identico per tutti e
 * uguale a un umano. Cambiano quanto a fondo pensa:
 *
 *   facile     poche simulazioni, ipotesi scelta a caso fra le carte ignote,
 *              accusa solo a colpo sicuro. Sbaglia come sbaglia un principiante:
 *              chiede cose che sapeva gia.
 *   medio      sceglie l'ipotesi il cui esito e piu incerto (entropia dell'esito).
 *              Buona approssimazione, costa poco.
 *   difficile  calcola il guadagno di informazione ATTESO sulla distribuzione
 *              della soluzione, si sposta verso la stanza che vale di piu e
 *              confuta in modo da non regalare informazione.
 */

/**
 * Mondi usati per classificare le ipotesi. La classifica converge molto prima
 * delle probabilita: 400 mondi bastano a scegliere bene, 3000 servirebbero solo
 * a rallentare.
 */
const SCORING_WORLDS = 400

export interface BotProfile {
  readonly level: BotLevel
  /** Mondi campionati a ogni decisione. */
  readonly samples: number
  /** Probabilita minima per rischiare l'accusa senza averne la certezza. */
  readonly accuseThreshold: number
  /** Come sceglie l'ipotesi. */
  readonly suggest: 'random' | 'entropy' | 'infogain'
  /** Se true, evita di regalare informazione quando confuta. */
  readonly cleverDisprove: boolean
}

export const PROFILES: Readonly<Record<BotLevel, BotProfile>> = {
  facile: { level: 'facile', samples: 250, accuseThreshold: 1, suggest: 'random', cleverDisprove: false },
  medio: { level: 'medio', samples: 1200, accuseThreshold: 0.98, suggest: 'entropy', cleverDisprove: true },
  difficile: {
    level: 'difficile',
    samples: 3000,
    accuseThreshold: 0.93,
    suggest: 'infogain',
    cleverDisprove: true,
  },
}

/**
 * La memoria privata di un bot: solo cio che ha legittimamente visto.
 * Vive fuori dal `GameState` perche non e stato di gioco, ed e per definizione
 * informazione di un solo giocatore.
 */
export interface BotMemory {
  /** Carte mostrate al bot: carta -> chi gliel'ha mostrata. */
  readonly seen: Record<string, string>
  /** Carte che il bot ha mostrato, per giocatore: evita di regalarne altre. */
  readonly shown: Record<string, string[]>
}

export const emptyMemory = (): BotMemory => ({ seen: {}, shown: {} })

/**
 * Tutto cio che il bot riceve per decidere.
 *
 * Sono esattamente i due oggetti che riceve un telefono: la vista pubblica e la
 * propria vista privata. Non esiste un campo da cui possa risalire alle mani
 * altrui o alla busta — l'onesta e una proprieta della firma, non una promessa
 * nei commenti.
 */
export interface BotView {
  readonly pub: PublicState
  readonly priv: PrivateState
  readonly memory: BotMemory
  readonly profile: BotProfile
  readonly rng: RngState
}

export interface BotDecision {
  readonly action: Action
  /** Riga leggibile sul perche, utile in sviluppo e per il log della TV. */
  readonly rationale: string
  readonly belief: Belief
}

// ---------------------------------------------------------------- utilita

const entropy = (counts: Iterable<number>, total: number): number => {
  if (total === 0) return 0
  let h = 0
  for (const c of counts) {
    if (c <= 0) continue
    const p = c / total
    h -= p * Math.log2(p)
  }
  return h
}

/** Ordine orario di interrogazione a partire da chi ipotizza. */
function disproveOrder(pub: PublicState, suggesterId: string): string[] {
  const seats = pub.turnOrder
    .map((s) => pub.players.find((p) => p.suspect === s))
    .filter((p): p is PublicState['players'][number] => Boolean(p))
  const start = seats.findIndex((p) => p.id === suggesterId)
  if (start < 0) return []
  const out: string[] = []
  for (let i = 1; i < seats.length; i++) {
    const p = seats[(start + i) % seats.length]
    if (p) out.push(p.id)
  }
  return out
}

/**
 * In un dato mondo, chi confuterebbe questa ipotesi e con che carta.
 * E la simulazione che rende misurabile il valore di una domanda.
 */
function outcomeInWorld(
  world: ReadonlyMap<CardKey, HolderId>,
  order: readonly string[],
  cards: readonly CardKey[],
): string {
  for (const pid of order) {
    const held = cards.filter((c) => world.get(c) === pid)
    if (held.length > 0) return pid + ':' + held.sort().join(',')
  }
  return 'nessuno'
}

const trioKey = (world: ReadonlyMap<CardKey, HolderId>): string => {
  const parts: string[] = []
  for (const [card, holder] of world) if (holder === ENVELOPE) parts.push(card)
  return parts.sort().join('|')
}

// ------------------------------------------------------------- valutazione

export interface SuggestionScore {
  readonly suspect: SuspectId
  readonly weapon: WeaponId
  readonly score: number
}

/**
 * Valuta ogni ipotesi possibile nella stanza indicata.
 *
 * `infogain` calcola la riduzione attesa di entropia sulla distribuzione della
 * soluzione: H(soluzione) meno la media pesata delle entropie condizionate a
 * ciascun esito possibile. E il valore di informazione della domanda, nel senso
 * letterale della teoria dell'informazione.
 *
 * `entropy` usa solo l'incertezza dell'esito: piu economico, quasi altrettanto
 * buono, perche una domanda di cui non si conosce la risposta e quasi sempre
 * anche una domanda che insegna.
 */
export function scoreSuggestions(
  pub: PublicState,
  belief: Belief,
  meId: string,
  room: RoomId,
  mode: BotProfile['suggest'],
  roll: (max: number) => number,
): SuggestionScore[] {
  const order = disproveOrder(pub, meId)

  /**
   * Ipotesi gia formulate da questo bot in questa stanza.
   *
   * Rifarne una identica e garantito insegnare zero: la risposta sara la
   * stessa. Lo storico e pubblico, quindi consultarlo e lecito — e la stessa
   * cosa che fa un umano guardando il proprio taccuino.
   */
  const alreadyAsked = new Set(
    pub.history
      .filter((h) => h.suggesterId === meId && h.suggestion.room === room)
      .map((h) => `${h.suggestion.suspect}|${h.suggestion.weapon}`),
  )
  // Le 36 ipotesi si valutano su un sottoinsieme dei mondi: la classifica si
  // stabilizza molto prima delle marginali, e questo ciclo e il piu caldo del
  // bot. Le probabilita restano calcolate su tutti i mondi.
  const worlds = belief.sampled.slice(0, SCORING_WORLDS)
  const total = worlds.length
  const scores: SuggestionScore[] = []
  if (total === 0) return scores

  // La terna di ogni mondo si calcola UNA volta, non una per candidata.
  const trios = worlds.map(trioKey)
  const priorTrios = new Map<string, number>()
  for (const t of trios) priorTrios.set(t, (priorTrios.get(t) ?? 0) + 1)
  const priorH = entropy(priorTrios.values(), total)

  for (const suspect of SUSPECT_IDS) {
    for (const weapon of WEAPON_IDS) {
      const repeated = alreadyAsked.has(`${suspect}|${weapon}`)

      if (mode === 'random') {
        scores.push({ suspect, weapon, score: repeated ? -1 : roll(1000) })
        continue
      }

      const cards: CardKey[] = [suspectCard(suspect), weaponCard(weapon), roomCard(room)]
      const buckets = new Map<string, Map<string, number>>()
      const bucketSize = new Map<string, number>()

      for (let i = 0; i < total; i++) {
        const w = worlds[i] as ReadonlyMap<CardKey, HolderId>
        const outcome = outcomeInWorld(w, order, cards)
        bucketSize.set(outcome, (bucketSize.get(outcome) ?? 0) + 1)
        if (mode === 'infogain') {
          let inner = buckets.get(outcome)
          if (!inner) {
            inner = new Map<string, number>()
            buckets.set(outcome, inner)
          }
          const key = trios[i] as string
          inner.set(key, (inner.get(key) ?? 0) + 1)
        }
      }

      if (mode === 'entropy') {
        const score = entropy(bucketSize.values(), total)
        scores.push({ suspect, weapon, score: repeated ? score - 10 : score })
        continue
      }

      // infogain: H(soluzione) - E[H(soluzione | esito)]
      let expected = 0
      for (const [outcome, inner] of buckets) {
        const size = bucketSize.get(outcome) ?? 0
        expected += (size / total) * entropy(inner.values(), size)
      }
      const gain = priorH - expected
      scores.push({ suspect, weapon, score: repeated ? gain - 10 : gain })
    }
  }

  return scores.sort((a, b) => b.score - a.score)
}

/**
 * Quanto vale entrare in questa stanza.
 *
 * Misurato sull'incertezza residua della SUA carta: sospetto e arma si possono
 * scegliere liberamente in qualsiasi stanza, la carta stanza no — e l'unica
 * variabile che il bot non controlla, quindi e quella che decide dove andare.
 * Una stanza la cui carta e gia localizzata non insegna piu nulla sulla busta.
 *
 * Volutamente NON chiama `scoreSuggestions`: valutare 36 ipotesi per ognuna
 * delle 9 stanze a ogni passo costava due ordini di grandezza in piu e
 * cambiava la classifica quasi mai.
 */
function roomValue(belief: Belief, room: RoomId): number {
  const card = roomCard(room)
  const spread = belief.holder.get(card)
  if (!spread) return 0
  // Entropia della posizione della carta: massima quando e del tutto ignota.
  let h = 0
  for (const p of spread.values()) {
    if (p > 0) h -= p * Math.log2(p)
  }
  // Piccolo premio a chi e gia candidata per la busta.
  return h + (belief.envelope.get(card) ?? 0) * 0.75
}

/** Il valore della migliore stanza del tabellone, esclusa quella appena lasciata. */
function bestRoomValue(belief: Belief, forbidden: RoomId | null): number {
  let best = 0
  for (const room of ROOM_IDS) {
    if (room === forbidden) continue
    const value = roomValue(belief, room)
    if (value > best) best = value
  }
  return best
}

// ----------------------------------------------------------------- decisioni

/**
 * Decide la prossima azione del bot a partire dalla sua vista.
 *
 * Restituisce sempre un'azione legale per la fase corrente: chi la riceve la
 * inoltra al reducer come farebbe un telefono, e il reducer la rivalida
 * comunque. Un bot non ha corsie preferenziali.
 */
export function decide(view: BotView): BotDecision | null {
  const { pub, priv, memory, profile } = view
  const me = pub.players.find((p) => p.id === priv.playerId)
  if (!me) return null

  let rng = view.rng
  const roll = (max: number): number => {
    const [v, next] = nextInt(rng, Math.max(1, max))
    rng = next
    return v
  }

  const belief = computeBelief(
    notesContext(pub),
    { meId: me.id, myHand: priv.hand, seen: memory.seen },
    { samples: profile.samples, rng },
  )

  const phase = pub.phase

  // --- devo confutare: precede tutto, anche fuori dal mio turno -----------
  if (phase.kind === 'resolving_suggestion' && phase.awaitingFrom === me.id) {
    const card = chooseCardToShow(priv.mustShowFrom, phase.suggesterId, memory, profile, roll)
    if (!card) return null
    return {
      action: { type: 'SHOW_CARD', playerId: me.id, card },
      rationale: 'confuta mostrando una carta gia nota a chi ha chiesto, se possibile',
      belief,
    }
  }

  if (phase.kind === 'suggestion_result' && phase.suggesterId === me.id) {
    return { action: { type: 'ACKNOWLEDGE', playerId: me.id }, rationale: 'prende atto', belief }
  }

  // Fuori dal proprio turno non c'e altro da fare.
  const currentSuspect = pub.turnOrder[pub.turnIndex % pub.turnOrder.length]
  const isMyTurn = currentSuspect === me.suspect
  if (!isMyTurn || me.eliminated) return null

  // --- accusa: si valuta prima di ogni altra cosa -------------------------
  const accusation = considerAccusation(belief, me.hasAccused, profile)
  if (accusation) {
    return {
      action: { type: 'MAKE_ACCUSATION', playerId: me.id, ...accusation.solution },
      rationale: accusation.reason,
      belief,
    }
  }

  const position = pub.positions[me.suspect] as Position

  switch (phase.kind) {
    case 'awaiting_roll': {
      /**
       * Passaggio segreto: gratuito, ma solo se porta dove serve.
       *
       * Trappola misurata sul campo: le due coppie di angoli collegati sono
       * anche le uniche stanze con un passaggio, e un bot che valuta solo
       * "meglio di dove sono" ci rimbalza dentro per sempre — Cucina, Studio,
       * Cucina, Studio — ripetendo la stessa ipotesi e non imparando piu nulla.
       * Il confronto giusto non e con la stanza attuale, e con la migliore
       * stanza del tabellone.
       */
      if (position?.kind === 'room') {
        const dest = secretPassageFrom(position.room)
        if (dest) {
          const there = roomValue(belief, dest)
          const best = bestRoomValue(belief, pub.leftRoomThisTurn)
          if (there >= best * 0.7 && there > 0.05) {
            return {
              action: { type: 'USE_SECRET_PASSAGE', playerId: me.id },
              rationale: `passaggio segreto verso ${ROOM_BY_ID[dest].name} (valore ${there.toFixed(2)})`,
              belief,
            }
          }
        }
      }
      return { action: { type: 'ROLL_DICE', playerId: me.id }, rationale: 'tira i dadi', belief }
    }

    case 'moving': {
      const target = chooseDestination(pub, belief, me.id, me.suspect, position)
      if (!target) {
        return { action: { type: 'END_TURN', playerId: me.id }, rationale: 'nessuna mossa legale', belief }
      }
      return target.decision(belief)
    }

    case 'in_room': {
      if (!phase.canSuggest) {
        return { action: { type: 'END_TURN', playerId: me.id }, rationale: 'ipotesi gia fatta', belief }
      }
      const ranked = scoreSuggestions(pub, belief, me.id, phase.room, profile.suggest, roll)
      const best = ranked[0]
      if (!best) {
        return { action: { type: 'END_TURN', playerId: me.id }, rationale: 'nessuna ipotesi utile', belief }
      }
      return {
        action: {
          type: 'MAKE_SUGGESTION',
          playerId: me.id,
          suspect: best.suspect,
          weapon: best.weapon,
        },
        rationale: `ipotesi con guadagno atteso ${best.score.toFixed(3)}`,
        belief,
      }
    }

    default:
      return null
  }
}

/** Accusa solo quando conviene: sbagliare significa uscire dai turni. */
function considerAccusation(
  belief: Belief,
  hasAccused: boolean,
  profile: BotProfile,
): { solution: Solution; reason: string } | null {
  if (hasAccused) return null
  const { bestSolution } = belief

  if (belief.solved) {
    return { solution: stripP(bestSolution), reason: 'soluzione dedotta con certezza' }
  }
  if (bestSolution.p >= profile.accuseThreshold) {
    return {
      solution: stripP(bestSolution),
      reason: `accusa a ${(bestSolution.p * 100).toFixed(1)}% di confidenza`,
    }
  }
  return null
}

const stripP = (s: Solution & { p: number }): Solution => ({
  suspect: s.suspect,
  weapon: s.weapon,
  room: s.room,
})

/**
 * Scelta della destinazione.
 *
 * Le stanze raggiungibili vengono ordinate per valore informativo. Se nessuna e
 * a portata, ci si avvicina a quella che vale di piu invece di muoversi a caso:
 * il corridoio non insegna nulla, e ogni turno speso fuori dalle stanze e un
 * turno perso.
 */
function chooseDestination(
  pub: PublicState,
  belief: Belief,
  meId: string,
  mySuspect: SuspectId,
  from: Position,
): { decision: (b: Belief) => BotDecision } | null {
  const phase = pub.phase
  if (phase.kind !== 'moving') return null
  const dice = phase.dice[0] + phase.dice[1]

  const blocked = new Set(
    Object.entries(pub.positions)
      .filter(([id, p]) => id !== mySuspect && p.kind === 'corridor')
      .map(([, p]) => (p.kind === 'corridor' ? coordKey(p.at) : '')),
  )
  const options = reachable(from, dice, { blocked, forbiddenRoom: pub.leftRoomThisTurn })

  // Quanto vale ogni stanza, raggiungibile o no.
  let goal: RoomId | null = null
  let goalValue = -Infinity
  for (const room of ROOM_IDS) {
    if (room === pub.leftRoomThisTurn) continue
    const value = roomValue(belief, room)
    if (value > goalValue) {
      goalValue = value
      goal = room
    }
  }

  // 1. Stanze a portata: la migliore fra queste.
  const rooms = [...options.rooms.keys()]
  let bestRoom: RoomId | null = null
  let bestScore = -Infinity
  for (const room of rooms) {
    const value = roomValue(belief, room)
    if (value > bestScore) {
      bestScore = value
      bestRoom = room
    }
  }

  /**
   * Entrare nella stanza piu vicina e la trappola classica di questo gioco.
   *
   * Sospetto e arma si possono nominare da qualunque stanza; la carta stanza
   * no — per metterla alla prova bisogna esserci dentro. Un bot che entra
   * sempre dove capita finisce per rimbalzare fra due stanze adiacenti,
   * riprovando all'infinito una carta stanza che ha gia escluso, e non chiude
   * mai il caso. Misurato: cosi le partite non finivano in 160 turni.
   *
   * Quindi si entra solo se la stanza a portata vale quanto la migliore in
   * assoluto; altrimenti conviene spendere il turno per avvicinarsi.
   */
  const worthEntering = bestRoom !== null && (goalValue <= 0.05 || bestScore >= goalValue * 0.7)

  if (worthEntering && bestRoom) {
    const room = bestRoom
    const score = bestScore
    return {
      decision: (b) => ({
        action: { type: 'MOVE_TO', playerId: meId, target: { kind: 'room', room } },
        rationale: `entra in ${ROOM_BY_ID[room].name} (valore ${score.toFixed(2)})`,
        belief: b,
      }),
    }
  }

  // 2. Nessuna stanza vale la sosta: ci si avvicina a quella che vale di piu.

  const corridors = [...options.corridors.entries()]
  if (corridors.length === 0 || !goal) {
    if (!bestRoom) return null
    const room = bestRoom
    return {
      decision: (b) => ({
        action: { type: 'MOVE_TO', playerId: meId, target: { kind: 'room', room } },
        rationale: `entra in ${ROOM_BY_ID[room].name} (unica opzione)`,
        belief: b,
      }),
    }
  }

  const target = goal
  let bestKey: string | null = null
  let bestDistance = Infinity
  for (const [key] of corridors) {
    const [c, r] = key.split(',').map(Number)
    const d = distance({ kind: 'corridor', at: { c: c as number, r: r as number } }, inRoom(target))
    if (d < bestDistance) {
      bestDistance = d
      bestKey = key
    }
  }
  if (!bestKey) return null

  const [c, r] = bestKey.split(',').map(Number)
  const at: Coord = { c: c as number, r: r as number }
  return {
    decision: (b) => ({
      action: { type: 'MOVE_TO', playerId: meId, target: { kind: 'corridor', at } },
      rationale: `si avvicina a ${ROOM_BY_ID[target].name} (${bestDistance} passi)`,
      belief: b,
    }),
  }
}

/**
 * Quale carta mostrare quando se ne hanno piu d'una.
 *
 * La tattica corretta, e che i giocatori forti applicano sempre: rimostrare a
 * quel giocatore una carta che gli si e gia mostrata. Non gli si insegna nulla
 * di nuovo, mentre mostrargliene una diversa gli regalerebbe una seconda
 * informazione gratis. E onesto: si sceglie fra le proprie carte, usando solo
 * il ricordo di cosa si e gia mostrato a chi.
 */
export function chooseCardToShow(
  candidates: readonly CardKey[],
  askerId: string,
  memory: BotMemory,
  profile: BotProfile,
  roll: (max: number) => number,
): CardKey | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0] as CardKey

  if (profile.cleverDisprove) {
    const already = memory.shown[askerId] ?? []
    const repeat = candidates.find((c) => already.includes(c))
    if (repeat) return repeat
  }
  return candidates[roll(candidates.length)] as CardKey
}
