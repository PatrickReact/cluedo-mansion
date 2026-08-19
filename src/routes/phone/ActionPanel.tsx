import { useState } from 'react'
import { motion } from 'motion/react'
import { DoorOpen, Dices, Gavel, HelpCircle, SkipForward, Sparkles } from 'lucide-react'
import { ROOM_BY_ID, SUSPECTS, SUSPECT_BY_ID, WEAPONS, ROOMS } from '@/engine/constants'
import type { RoomId, SuspectId, WeaponId } from '@/engine/constants'
import { secretPassageFrom, reachable, coordKey } from '@/engine/board'
import type { Coord, Position } from '@/engine/board'
import type { PrivateState, PublicState } from '@/engine/redact'
import type { Action } from '@/engine/actions'
import { cardLabel } from '@/engine/cards'
import { Board } from '@/ui/Board'
import { Die } from '@/ui/Die'
import { useShake } from '@/hooks/useShake'
import { cn } from '@/lib/cn'

interface ActionPanelProps {
  readonly pub: PublicState
  readonly priv: PrivateState | null
  readonly playerId: string
  readonly send: (action: Action) => void
}

/**
 * IL PANNELLO AZIONI — cambia forma a ogni fase del turno.
 *
 * Principio guida: sullo schermo compare solo ciò che è possibile fare ADESSO.
 * Niente pulsanti disattivati a decorare l'interfaccia; se un'azione non è
 * legale, semplicemente non c'è. Chi non è di turno vede cosa sta succedendo,
 * non una plancia inerte.
 */
export function ActionPanel({ pub, priv, playerId, send }: ActionPanelProps) {
  const me = pub.players.find((p) => p.id === playerId)
  const currentSuspect = pub.turnOrder[pub.turnIndex % pub.turnOrder.length] ?? null
  const currentPlayer = pub.players.find((p) => p.suspect === currentSuspect && !p.isNpc)
  const isMyTurn = currentPlayer?.id === playerId
  const phase = pub.phase

  // --- devo confutare: ha la precedenza su tutto, anche fuori dal mio turno ---
  if (phase.kind === 'resolving_suggestion' && phase.awaitingFrom === playerId) {
    return (
      <DisproveChoice
        cards={priv?.mustShowFrom ?? []}
        onShow={(card) => send({ type: 'SHOW_CARD', playerId, card })}
      />
    )
  }

  if (!me) return <Waiting text="Ti stiamo cercando fra i sospetti…" />

  if (me.eliminated && phase.kind !== 'game_over') {
    return (
      <Waiting
        text="Sei fuori dai giochi dopo l'accusa sbagliata, ma continui a mostrare le carte quando ti interrogano."
        tone="danger"
      />
    )
  }

  if (phase.kind === 'game_over') {
    const winner = pub.players.find((p) => p.id === phase.winnerId)
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <Sparkles className="text-gold size-10" strokeWidth={1.4} />
        <p className="font-display text-3xl">
          {winner
            ? winner.id === playerId
              ? 'Hai risolto il caso.'
              : `${winner.name} ha risolto il caso.`
            : 'Caso irrisolto.'}
        </p>
        {phase.solution && (
          <p className="text-paper-dim">
            {SUSPECT_BY_ID[phase.solution.suspect].name}, in {ROOM_BY_ID[phase.solution.room].name}, con{' '}
            {WEAPONS.find((w) => w.id === phase.solution?.weapon)?.name}.
          </p>
        )}
      </div>
    )
  }

  if (phase.kind === 'suggestion_result') {
    if (phase.suggesterId !== playerId) {
      return <Waiting text={`${currentPlayer?.name ?? 'Il giocatore'} sta valutando la risposta…`} />
    }
    return (
      <div className="flex flex-col gap-4 p-5">
        <h2 className="font-display text-gold text-2xl">Risposta all&apos;ipotesi</h2>
        {priv?.reveal ? (
          <div className="deco-panel flex flex-col items-center gap-3 p-6">
            <p className="text-paper-dim text-sm tracking-widest uppercase">
              {pub.players.find((p) => p.id === priv.reveal?.fromPlayerId)?.name} ti mostra
            </p>
            <p className="font-display text-paper text-3xl">{cardLabel(priv.reveal.card)}</p>
            <p className="text-paper-dim text-xs">Segnata nel taccuino. Nessun altro l&apos;ha vista.</p>
          </div>
        ) : (
          <div className="deco-panel p-6 text-center">
            <p className="text-blood-bright text-lg">Nessuno ha potuto confutare.</p>
            <p className="text-paper-dim mt-2 text-sm">
              Le tre carte che hai nominato non sono in nessuna mano — a meno che tu non ne abbia una.
            </p>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => send({ type: 'ACKNOWLEDGE', playerId })}
        >
          Ho capito
        </button>
      </div>
    )
  }

  if (!isMyTurn) {
    return (
      <Waiting
        text={
          phase.kind === 'resolving_suggestion'
            ? `${pub.players.find((p) => p.id === phase.awaitingFrom)?.name ?? 'Qualcuno'} sta scegliendo una carta…`
            : `Tocca a ${currentPlayer?.name ?? '…'}. Intanto puoi aggiornare il taccuino.`
        }
      />
    )
  }

  // ------------------------------------------------------------- il mio turno
  switch (phase.kind) {
    case 'awaiting_roll':
      return <RollPanel pub={pub} me={me} playerId={playerId} send={send} />
    case 'moving':
      return <MovePanel pub={pub} me={me} playerId={playerId} send={send} />
    case 'in_room':
      return (
        <RoomPanel
          pub={pub}
          room={phase.room}
          canSuggest={phase.canSuggest}
          me={me}
          playerId={playerId}
          send={send}
        />
      )
    default:
      return <Waiting text="Un attimo…" />
  }
}

// ------------------------------------------------------------------ pannelli

type Me = PublicState['players'][number]

function RollPanel({
  pub,
  me,
  playerId,
  send,
}: {
  pub: PublicState
  me: Me
  playerId: string
  send: (a: Action) => void
}) {
  const [rolling, setRolling] = useState(false)
  const position = pub.positions[me.suspect] as Position
  const room = position?.kind === 'room' ? position.room : null
  const passage = room ? secretPassageFrom(room) : null
  const canSuggestNow =
    pub.config.suggestionMoveGrantsSuggestion && room !== null && pub.draggedBySuggestion.includes(me.suspect)

  const roll = (): void => {
    setRolling(true)
    setTimeout(() => setRolling(false), 700)
    send({ type: 'ROLL_DICE', playerId })
  }

  const { permission, requestPermission } = useShake({
    enabled: true,
    onShake: roll,
  })

  return (
    <div className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-gold text-2xl">Tocca a te</h2>

      <button
        type="button"
        onClick={roll}
        className="deco-panel flex flex-col items-center gap-4 py-10 transition active:scale-[0.98]"
      >
        <div className={cn('flex gap-4', permission !== 'granted' && 'shake-hint')}>
          <Die value={rolling ? 6 : 3} size={68} rolling={rolling} />
          <Die value={rolling ? 2 : 5} size={68} rolling={rolling} />
        </div>
        <span className="flex items-center gap-2 text-xl">
          <Dices className="text-gold size-6" /> Tira i dadi
        </span>
        <span className="text-paper-dim text-xs">
          {permission === 'granted' ? 'oppure scuoti il telefono' : 'tocca per tirare'}
        </span>
      </button>

      {permission === 'prompt' && (
        <button type="button" className="btn btn-ghost" onClick={() => void requestPermission()}>
          Attiva lo scuotimento
        </button>
      )}

      {passage && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => send({ type: 'USE_SECRET_PASSAGE', playerId })}
        >
          <DoorOpen className="text-plum size-5" />
          Passaggio segreto → {ROOM_BY_ID[passage].name}
        </button>
      )}

      {canSuggestNow && room && (
        <p className="border-gold/40 bg-gold/10 text-paper-dim rounded-xl border px-4 py-3 text-sm">
          Sei stato trascinato in {ROOM_BY_ID[room].name} da un&apos;ipotesi altrui: puoi ipotizzare da qui
          senza tirare.
        </p>
      )}
      {canSuggestNow && room && <SuggestButton room={room} playerId={playerId} send={send} />}

      <AccuseButton playerId={playerId} send={send} disabled={me.hasAccused} />
    </div>
  )
}

function MovePanel({
  pub,
  me,
  playerId,
  send,
}: {
  pub: PublicState
  me: Me
  playerId: string
  send: (a: Action) => void
}) {
  const phase = pub.phase
  if (phase.kind !== 'moving') return null
  const total = phase.dice[0] + phase.dice[1]

  const from = pub.positions[me.suspect] as Position
  const blocked = new Set(
    Object.entries(pub.positions)
      .filter(([id, p]) => id !== me.suspect && p.kind === 'corridor')
      .map(([, p]) => (p.kind === 'corridor' ? coordKey(p.at) : '')),
  )
  const options = reachable(from, total, { blocked, forbiddenRoom: pub.leftRoomThisTurn })
  const rooms = [...options.rooms.keys()]

  const move = (target: { kind: 'corridor'; at: Coord } | { kind: 'room'; room: RoomId }): void => {
    send({ type: 'MOVE_TO', playerId, target })
  }

  const stuck = options.corridors.size === 0 && rooms.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Die value={phase.dice[0]} size={40} />
        {phase.dice[1] > 0 && <Die value={phase.dice[1]} size={40} />}
        <p className="font-display text-gold text-2xl">{total} passi</p>
      </div>

      {rooms.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-paper-dim text-xs tracking-widest uppercase">Stanze a portata</p>
          <div className="grid grid-cols-2 gap-2">
            {rooms.map((room) => (
              <button
                key={room}
                type="button"
                onClick={() => move({ kind: 'room', room })}
                className="btn btn-primary !min-h-14 text-base"
              >
                <img src={`/assets/rooms/${room}.svg`} alt="" className="size-6" />
                {ROOM_BY_ID[room].name}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-paper-dim text-xs tracking-widest uppercase">
        {rooms.length > 0 ? 'oppure muoviti nel corridoio' : 'scegli dove fermarti'}
      </p>
      <div className="border-paper/10 bg-ink-2 flex min-h-[52vh] flex-1 items-center justify-center overflow-hidden rounded-xl border p-1.5">
        <Board
          variant="phone"
          className="max-h-full max-w-full"
          positions={pub.positions}
          weapons={pub.weapons}
          activeSuspect={me.suspect}
          reachableCorridors={new Set(options.corridors.keys())}
          reachableRooms={new Set(rooms)}
          onPickCorridor={(at) => move({ kind: 'corridor', at })}
          onPickRoom={(room) => move({ kind: 'room', room })}
        />
      </div>

      {stuck && (
        <button type="button" className="btn btn-ghost" onClick={() => send({ type: 'END_TURN', playerId })}>
          <SkipForward className="size-5" /> Bloccato: passa il turno
        </button>
      )}
    </div>
  )
}

function RoomPanel({
  pub,
  room,
  canSuggest,
  me,
  playerId,
  send,
}: {
  pub: PublicState
  room: RoomId
  canSuggest: boolean
  me: Me
  playerId: string
  send: (a: Action) => void
}) {
  void pub
  return (
    <div className="flex flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <img src={`/assets/rooms/${room}.svg`} alt="" className="size-10" />
        <div>
          <p className="text-paper-dim text-xs tracking-widest uppercase">Ti trovi in</p>
          <h2 className="font-display text-paper text-2xl">{ROOM_BY_ID[room].name}</h2>
        </div>
      </header>

      {canSuggest ? (
        <SuggestButton room={room} playerId={playerId} send={send} />
      ) : (
        <p className="border-paper/10 bg-ink-2 text-paper-dim rounded-xl border px-4 py-3 text-sm">
          Hai già fatto la tua ipotesi in questo turno.
        </p>
      )}

      <AccuseButton playerId={playerId} send={send} disabled={me.hasAccused} />

      <button type="button" className="btn btn-ghost" onClick={() => send({ type: 'END_TURN', playerId })}>
        <SkipForward className="size-5" /> Fine turno
      </button>
    </div>
  )
}

// --------------------------------------------------------------- form scelte

function SuggestButton({
  room,
  playerId,
  send,
}: {
  room: RoomId
  playerId: string
  send: (a: Action) => void
}) {
  const [open, setOpen] = useState(false)
  const [suspect, setSuspect] = useState<SuspectId | null>(null)
  const [weapon, setWeapon] = useState<WeaponId | null>(null)

  if (!open) {
    return (
      <button type="button" className="btn btn-primary text-lg" onClick={() => setOpen(true)}>
        <HelpCircle className="size-5" /> Fai un&apos;ipotesi
      </button>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <p className="text-paper-dim text-sm">
        Nella stanza in cui ti trovi — <strong className="text-paper">{ROOM_BY_ID[room].name}</strong> — chi,
        e con quale arma?
      </p>

      <Picker
        label="Sospetto"
        items={SUSPECTS.map((s) => ({ id: s.id, label: s.shortName, icon: `/assets/tokens/${s.id}.svg` }))}
        value={suspect}
        onChange={(v) => setSuspect(v as SuspectId)}
      />
      <Picker
        label="Arma"
        items={WEAPONS.map((w) => ({ id: w.id, label: w.name, icon: `/assets/weapons/${w.id}.svg` }))}
        value={weapon}
        onChange={(v) => setWeapon(v as WeaponId)}
      />

      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>
          Annulla
        </button>
        <button
          type="button"
          className="btn btn-primary flex-[2]"
          disabled={!suspect || !weapon}
          onClick={() => {
            if (suspect && weapon) send({ type: 'MAKE_SUGGESTION', playerId, suspect, weapon })
            setOpen(false)
          }}
        >
          Dichiara l&apos;ipotesi
        </button>
      </div>
    </motion.div>
  )
}

function AccuseButton({
  playerId,
  send,
  disabled,
}: {
  playerId: string
  send: (a: Action) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [suspect, setSuspect] = useState<SuspectId | null>(null)
  const [weapon, setWeapon] = useState<WeaponId | null>(null)
  const [room, setRoom] = useState<RoomId | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (disabled) return null

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost !border-blood/50 text-blood-bright"
        onClick={() => setOpen(true)}
      >
        <Gavel className="size-5" /> Accusa finale
      </button>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
      <p className="border-blood/50 bg-blood/15 text-blood-bright rounded-xl border px-4 py-3 text-sm">
        Una sola accusa per partita. Se sbagli resti al tavolo solo per mostrare le carte.
      </p>

      <Picker
        label="Sospetto"
        items={SUSPECTS.map((s) => ({ id: s.id, label: s.shortName, icon: `/assets/tokens/${s.id}.svg` }))}
        value={suspect}
        onChange={(v) => setSuspect(v as SuspectId)}
      />
      <Picker
        label="Arma"
        items={WEAPONS.map((w) => ({ id: w.id, label: w.name, icon: `/assets/weapons/${w.id}.svg` }))}
        value={weapon}
        onChange={(v) => setWeapon(v as WeaponId)}
      />
      <Picker
        label="Stanza"
        items={ROOMS.map((r) => ({ id: r.id, label: r.name, icon: `/assets/rooms/${r.id}.svg` }))}
        value={room}
        onChange={(v) => setRoom(v as RoomId)}
      />

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          onClick={() => {
            setOpen(false)
            setConfirming(false)
          }}
        >
          Annulla
        </button>
        <button
          type="button"
          className="btn btn-danger flex-[2]"
          disabled={!suspect || !weapon || !room}
          onClick={() => {
            if (!confirming) {
              setConfirming(true)
              return
            }
            if (suspect && weapon && room) send({ type: 'MAKE_ACCUSATION', playerId, suspect, weapon, room })
            setOpen(false)
            setConfirming(false)
          }}
        >
          {confirming ? 'Confermi? Tocca di nuovo' : 'Accusa'}
        </button>
      </div>
    </motion.div>
  )
}

interface PickerItem {
  readonly id: string
  readonly label: string
  readonly icon: string
}

function Picker({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: readonly PickerItem[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-paper-dim text-xs tracking-widest uppercase">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center transition',
              value === item.id ? 'border-gold bg-gold/20' : 'border-paper/10 bg-ink-2',
            )}
          >
            <img src={item.icon} alt="" className="size-7" />
            <span className="text-paper-dim text-[0.7rem] leading-tight">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function DisproveChoice({ cards, onShow }: { cards: readonly string[]; onShow: (card: string) => void }) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-peacock text-2xl">Devi confutare</h2>
      <p className="text-paper-dim text-sm">
        Hai più di una carta che smentisce l&apos;ipotesi. Scegline una: la vedrà solo chi ha ipotizzato.
      </p>
      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <button
            key={card}
            type="button"
            className="btn btn-primary !min-h-16 text-lg"
            onClick={() => onShow(card)}
          >
            {cardLabel(card as never)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Waiting({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'danger' }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <motion.div
        animate={{ opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        className={cn('size-3 rounded-full', tone === 'danger' ? 'bg-blood-bright' : 'bg-gold')}
      />
      <p className={cn('text-lg text-balance', tone === 'danger' ? 'text-blood-bright' : 'text-paper-dim')}>
        {text}
      </p>
    </div>
  )
}
