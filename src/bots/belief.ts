import { ROOM_IDS, SUSPECT_IDS, WEAPON_IDS } from '@/engine/constants'
import type { RoomId, SuspectId, WeaponId } from '@/engine/constants'
import { FULL_DECK, parseCard, roomCard, suspectCard, weaponCard } from '@/engine/cards'
import { ENVELOPE, computeNotes, expectedHandSizes, type Constraint, type NotesContext } from '@/engine/notes'
import { nextInt, type RngState } from '@/engine/rng'
import type { CardKey, Solution } from '@/engine/types'

/**
 * IL MODELLO PROBABILISTICO DEI BOT
 *
 * Un bot non "sa" la soluzione: mantiene una distribuzione di probabilita su
 * dove sia ogni carta, e la aggiorna a ogni informazione che esce dal tavolo.
 * Esattamente come farebbe un giocatore forte, solo senza dimenticarsi nulla.
 *
 * COSA ENTRA — e la garanzia di onesta, ed e strutturale, non promessa:
 * questa funzione riceve un `NotesContext` (chi siede, in che ordine, lo
 * storico PUBBLICO delle ipotesi) piu la mano del bot e le carte che gli sono
 * state mostrate. Le mani altrui e la busta non le riceve, quindi non puo
 * consultarle nemmeno per sbaglio.
 *
 * COME FUNZIONA — due livelli sovrapposti:
 *
 *  1. Deduzione esatta. Riusa `computeNotes`, lo stesso solver a punto fisso
 *     che alimenta il taccuino umano: chi ha passato non ha quelle carte, chi
 *     ha confutato ne ha almeno una, se una carta e esclusa per tutti sta nella
 *     busta. Cio che e certo resta certo.
 *
 *  2. Stima statistica sull'incerto. Il resto non e deducibile con certezza, ma
 *     non e nemmeno equiprobabile. Si campionano molte distribuzioni complete
 *     delle carte compatibili con TUTTO cio che si e osservato, e si contano le
 *     frequenze: se la busta contiene il Candeliere nel 70% dei mondi coerenti,
 *     quella e la sua probabilita.
 *
 * PERCHE CAMPIONARE E NON CONTARE. Contare esattamente i mondi coerenti e un
 * problema #P-difficile: gia a inizio partita le distribuzioni possibili sono
 * dell'ordine di 6^18. Il campionamento guidato dai vincoli da una stima
 * eccellente in pochi millisecondi. Non e un campionamento uniforme — i vincoli
 * "ha almeno una fra queste" vengono soddisfatti per costruzione — quindi le
 * marginali sono approssimate, non esatte. Per giocare bene basta e avanza;
 * per le certezze c'e il livello 1, che e esatto.
 *
 * DETERMINISMO. Nessun `Math.random()`: il campionamento parte da un
 * `RngState` derivato dal seed della partita e dall'id del bot. Stessa
 * partita, stesse decisioni — la partita resta rigiocabile, e un bug di un bot
 * si riproduce invece di svanire.
 */

/** Chi puo detenere una carta: un giocatore, oppure la busta. */
export type HolderId = string

export interface BotKnowledge {
  readonly meId: string
  readonly myHand: readonly CardKey[]
  /** Carte mostrate al bot: chiave carta -> id di chi l'ha mostrata. */
  readonly seen: Readonly<Record<string, string>>
}

export interface BeliefOptions {
  /** Numero di mondi da campionare. Piu alto = stima piu fine, piu lento. */
  readonly samples: number
  readonly rng: RngState
}

export interface Belief {
  /** Mondi coerenti effettivamente generati (puo essere < samples). */
  readonly worlds: number
  /** P(carta nella busta), per ogni carta. */
  readonly envelope: ReadonlyMap<CardKey, number>
  /** P(carta in mano a X), per ogni carta e ogni giocatore. */
  readonly holder: ReadonlyMap<CardKey, ReadonlyMap<HolderId, number>>
  /**
   * La terna piu probabile e la sua probabilita CONGIUNTA — non il prodotto
   * delle tre marginali: le tre carte della busta sono correlate, perche
   * escludersi a vicenda dalle mani le lega.
   */
  readonly bestSolution: Solution & { readonly p: number }
  /** Carte gia certe: il bot le conosce senza margine di dubbio. */
  readonly certain: {
    readonly envelope: readonly CardKey[]
    readonly heldBy: ReadonlyMap<CardKey, HolderId>
  }
  /** true se la soluzione e dedotta con certezza. */
  readonly solved: boolean
  /**
   * I mondi campionati, conservati perche la politica di gioco ci misura sopra
   * il guadagno di informazione di ogni ipotesi possibile. Ricampionare per
   * ciascuna delle 36 ipotesi candidate costerebbe 36 volte tanto.
   */
  readonly sampled: readonly ReadonlyMap<CardKey, HolderId>[]
}

const categoryOf = (card: CardKey): 'suspect' | 'weapon' | 'room' => parseCard(card).type

/**
 * Calcola la credenza corrente del bot.
 *
 * Il costo e dominato da `samples`; con 2000 mondi e sei giocatori sta
 * ampiamente sotto i 50 ms, cioe entro la pausa che comunque serve perche il
 * tavolo veda cosa sta succedendo sulla TV.
 */
export function computeBelief(ctx: NotesContext, knowledge: BotKnowledge, options: BeliefOptions): Belief {
  // --- livello 1: cio che e certo ----------------------------------------
  const notes = computeNotes(ctx, {
    viewerId: knowledge.meId,
    hand: knowledge.myHand,
    seen: knowledge.seen,
    manual: {},
  })

  const holders: HolderId[] = [...ctx.seats.map((s) => s.id), ENVELOPE]
  const capacity = expectedHandSizes(ctx)

  /** Assegnazioni gia certe, valide in ogni mondo coerente. */
  const forced = new Map<CardKey, HolderId>()
  /** Per ogni carta, i detentori non ancora esclusi. */
  const allowed = new Map<CardKey, HolderId[]>()

  for (const card of FULL_DECK) {
    const owner = holders.find((h) => notes.grid[h]?.[card] === 'has')
    if (owner) {
      forced.set(card, owner)
      continue
    }
    allowed.set(
      card,
      holders.filter((h) => notes.grid[h]?.[card] !== 'not'),
    )
  }

  // Vincoli "ha almeno una fra queste" ancora aperti.
  const openConstraints: Constraint[] = notes.constraints.filter(
    (c) => !c.cards.some((card) => forced.get(card) === c.playerId),
  )

  // --- livello 2: campionamento dei mondi coerenti ------------------------
  const envelopeCount = new Map<CardKey, number>()
  const holderCount = new Map<CardKey, Map<HolderId, number>>()
  const trioCount = new Map<string, number>()
  for (const card of FULL_DECK) {
    envelopeCount.set(card, 0)
    holderCount.set(card, new Map(holders.map((h) => [h, 0])))
  }

  let rng = options.rng
  const roll = (max: number): number => {
    const [value, next] = nextInt(rng, max)
    rng = next
    return value
  }
  const pick = <T>(items: readonly T[]): T | undefined =>
    items.length === 0 ? undefined : items[roll(items.length)]

  const sampled: Map<CardKey, HolderId>[] = []
  let worlds = 0
  const attempts = options.samples * 3

  for (let attempt = 0; attempt < attempts && worlds < options.samples; attempt++) {
    const world = sampleWorld({ forced, allowed, holders, capacity, openConstraints, pick, roll })
    if (!world) continue
    worlds++
    sampled.push(world)

    let suspect: SuspectId | null = null
    let weapon: WeaponId | null = null
    let room: RoomId | null = null

    for (const [card, holder] of world) {
      holderCount.get(card)?.set(holder, (holderCount.get(card)?.get(holder) ?? 0) + 1)
      if (holder !== ENVELOPE) continue
      envelopeCount.set(card, (envelopeCount.get(card) ?? 0) + 1)
      const parsed = parseCard(card)
      if (parsed.type === 'suspect') suspect = parsed.id
      else if (parsed.type === 'weapon') weapon = parsed.id
      else room = parsed.id
    }

    if (suspect && weapon && room) {
      const key = `${suspect}|${weapon}|${room}`
      trioCount.set(key, (trioCount.get(key) ?? 0) + 1)
    }
  }

  // --- marginali ----------------------------------------------------------
  const divisor = worlds || 1
  const envelope = new Map<CardKey, number>()
  const holder = new Map<CardKey, Map<HolderId, number>>()
  for (const card of FULL_DECK) {
    envelope.set(card, (envelopeCount.get(card) ?? 0) / divisor)
    const per = new Map<HolderId, number>()
    for (const h of holders) per.set(h, (holderCount.get(card)?.get(h) ?? 0) / divisor)
    holder.set(card, per)
  }

  let bestKey = ''
  let bestCount = -1
  for (const [key, count] of trioCount) {
    if (count > bestCount) {
      bestKey = key
      bestCount = count
    }
  }

  const fallback: Solution = {
    suspect: notes.candidates.suspects[0] ?? (SUSPECT_IDS[0] as SuspectId),
    weapon: notes.candidates.weapons[0] ?? (WEAPON_IDS[0] as WeaponId),
    room: notes.candidates.rooms[0] ?? (ROOM_IDS[0] as RoomId),
  }
  const parts = bestKey.split('|')
  const bestSolution: Solution & { p: number } =
    bestKey && parts.length === 3
      ? {
          suspect: parts[0] as SuspectId,
          weapon: parts[1] as WeaponId,
          room: parts[2] as RoomId,
          p: bestCount / divisor,
        }
      : { ...fallback, p: worlds === 0 ? 0 : bestCount / divisor }

  // Se la deduzione esatta ha gia chiuso il caso, quella vince sulla stima.
  const solved = notes.solved !== null
  const certainSolution = notes.solved

  return {
    worlds,
    envelope,
    holder,
    bestSolution: certainSolution ? { ...certainSolution, p: 1 } : bestSolution,
    certain: {
      envelope: FULL_DECK.filter((c) => notes.grid[ENVELOPE]?.[c] === 'has'),
      heldBy: forced,
    },
    solved,
    sampled,
  }
}

interface SampleArgs {
  readonly forced: ReadonlyMap<CardKey, HolderId>
  readonly allowed: ReadonlyMap<CardKey, readonly HolderId[]>
  readonly holders: readonly HolderId[]
  readonly capacity: ReadonlyMap<string, number>
  readonly openConstraints: readonly Constraint[]
  readonly pick: <T>(items: readonly T[]) => T | undefined
  readonly roll: (max: number) => number
}

/**
 * Genera UNA distribuzione completa delle carte compatibile con tutto cio che
 * il bot ha osservato, oppure `null` se il tentativo si incastra.
 *
 * L'ordine non e casuale: prima si soddisfano i vincoli piu stretti, poi la
 * busta, infine il resto. Soddisfare i vincoli per costruzione evita di
 * generare e buttare via mondi non validi, che a inizio partita sarebbero la
 * stragrande maggioranza.
 */
function sampleWorld(args: SampleArgs): Map<CardKey, HolderId> | null {
  const { forced, allowed, holders, capacity, openConstraints, pick, roll } = args

  const assignment = new Map<CardKey, HolderId>(forced)
  const remaining = new Map<HolderId, number>()
  for (const h of holders) {
    if (h === ENVELOPE) continue
    remaining.set(h, capacity.get(h) ?? 0)
  }
  for (const [, h] of forced) {
    if (h === ENVELOPE) continue
    remaining.set(h, (remaining.get(h) ?? 0) - 1)
  }

  // La busta contiene esattamente un sospetto, un'arma e una stanza.
  const envelopeNeed: Record<string, number> = { suspect: 1, weapon: 1, room: 1 }
  for (const [card, h] of forced) {
    if (h === ENVELOPE) envelopeNeed[categoryOf(card)] = 0
  }

  const canTake = (holder: HolderId, card: CardKey): boolean =>
    holder === ENVELOPE ? (envelopeNeed[categoryOf(card)] ?? 0) > 0 : (remaining.get(holder) ?? 0) > 0

  const place = (card: CardKey, holder: HolderId): void => {
    assignment.set(card, holder)
    if (holder === ENVELOPE) envelopeNeed[categoryOf(card)] = 0
    else remaining.set(holder, (remaining.get(holder) ?? 0) - 1)
  }

  // 1. Vincoli aperti: chi ha confutato deve davvero avere una delle tre carte.
  for (const constraint of openConstraints) {
    const already = constraint.cards.some((c) => assignment.get(c) === constraint.playerId)
    if (already) continue
    const options = constraint.cards.filter(
      (c) =>
        !assignment.has(c) &&
        (allowed.get(c) ?? []).includes(constraint.playerId) &&
        canTake(constraint.playerId, c),
    )
    const chosen = pick(options)
    if (!chosen) return null
    place(chosen, constraint.playerId)
  }

  // 2. La busta, categoria per categoria.
  for (const [category, ids, toKey] of [
    ['suspect', SUSPECT_IDS, suspectCard],
    ['weapon', WEAPON_IDS, weaponCard],
    ['room', ROOM_IDS, roomCard],
  ] as const) {
    if ((envelopeNeed[category] ?? 0) === 0) continue
    const options = (ids as readonly string[])
      .map((id) => toKey(id as never))
      .filter((c) => !assignment.has(c) && (allowed.get(c) ?? []).includes(ENVELOPE))
    const chosen = pick(options)
    if (!chosen) return null
    place(chosen, ENVELOPE)
  }

  // 3. Il resto, distribuito fra chi ha ancora posto.
  //    Le carte con meno detentori possibili vanno per prime: sono quelle che
  //    fanno fallire il tentativo, e sbagliarle presto costa meno.
  const rest = FULL_DECK.filter((c) => !assignment.has(c)).sort(
    (a, b) => (allowed.get(a)?.length ?? 0) - (allowed.get(b)?.length ?? 0),
  )
  for (const card of rest) {
    const options = (allowed.get(card) ?? []).filter((h) => canTake(h, card))
    if (options.length === 0) return null
    const chosen = options[roll(options.length)] as HolderId
    place(card, chosen)
  }

  return assignment
}
