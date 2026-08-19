import { Fragment, useMemo } from 'react'
import { Check, HelpCircle, Minus, X } from 'lucide-react'
import { ROOMS, SUSPECTS, WEAPONS } from '@/engine/constants'
import { roomCard, suspectCard, weaponCard } from '@/engine/cards'
import { ENVELOPE, type Mark, type NotesResult } from '@/engine/notes'
import type { CardKey } from '@/engine/types'
import type { PublicState } from '@/engine/redact'
import { cn } from '@/lib/cn'

interface NotebookProps {
  readonly pub: PublicState
  readonly notes: NotesResult | null
  readonly playerId: string
  readonly onToggle: (column: string, card: CardKey) => void
}

/**
 * IL TACCUINO DELL'INVESTIGATORE
 *
 * La griglia di sempre — carte in riga, giocatori in colonna — con una
 * differenza: le caselle che il gioco può dedurre da solo le compila lui e le
 * blocca (lucchetto). Il giocatore mette a mano solo le ipotesi vere e proprie.
 *
 * Le deduzioni automatiche non sono un aiuto opzionale: sono fatti che al
 * tavolo reale chiunque potrebbe ricavare guardando chi ha passato e chi ha
 * confutato. Automatizzarle toglie la contabilità, non il ragionamento.
 */
export function Notebook({ pub, notes, playerId, onToggle }: NotebookProps) {
  const players = pub.players.filter((p) => !p.isNpc)
  const columns = useMemo(() => [...players.map((p) => p.id), ENVELOPE], [players])

  const groups = [
    { title: 'Sospetti', rows: SUSPECTS.map((s) => ({ key: suspectCard(s.id), label: s.shortName })) },
    { title: 'Armi', rows: WEAPONS.map((w) => ({ key: weaponCard(w.id), label: w.name })) },
    { title: 'Stanze', rows: ROOMS.map((r) => ({ key: roomCard(r.id), label: r.name })) },
  ]

  if (!notes) {
    return <p className="text-paper-dim p-6 text-center">Il taccuino si apre a partita iniziata.</p>
  }

  return (
    <div className="flex flex-col gap-4 p-3 pb-6">
      {notes.solved && (
        <div className="deco-panel p-4 text-center">
          <p className="text-gold text-xs tracking-widest uppercase">Il taccuino è chiuso</p>
          <p className="font-display text-paper mt-1 text-lg">
            {SUSPECTS.find((s) => s.id === notes.solved?.suspect)?.name} ·{' '}
            {ROOMS.find((r) => r.id === notes.solved?.room)?.name} ·{' '}
            {WEAPONS.find((w) => w.id === notes.solved?.weapon)?.name}
          </p>
          <p className="text-paper-dim mt-1 text-xs">Ti resta solo da accusare al tuo turno.</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="bg-ink text-paper-dim sticky left-0 z-10 px-2 py-2 text-left text-xs font-normal tracking-wider uppercase">
                Carta
              </th>
              {columns.map((col) => {
                const p = players.find((x) => x.id === col)
                return (
                  <th key={col} className="px-1 py-2 text-center text-xs font-normal">
                    {col === ENVELOPE ? (
                      <span className="text-gold">Busta</span>
                    ) : (
                      <span
                        className={cn('block truncate', p?.id === playerId ? 'text-gold' : 'text-paper-dim')}
                        style={{ maxWidth: '4.5rem' }}
                      >
                        {p?.id === playerId ? 'Tu' : p?.name}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.title}>
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="bg-ink text-gold sticky left-0 px-2 pt-4 pb-1 text-xs tracking-widest uppercase"
                  >
                    {group.title}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="bg-ink text-paper-dim sticky left-0 z-10 py-0.5 pr-2">
                      <span className="block max-w-[7.5rem] truncate">{row.label}</span>
                    </td>
                    {columns.map((col) => {
                      const mark = notes.grid[col]?.[row.key] ?? 'unknown'
                      const locked = notes.locked[col]?.[row.key] ?? false
                      return (
                        <td key={col} className="p-0.5">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => onToggle(col, row.key)}
                            aria-label={`${row.label} · ${col === ENVELOPE ? 'busta' : players.find((p) => p.id === col)?.name}`}
                            className={cn(
                              'flex size-9 items-center justify-center rounded-md border transition',
                              MARK_STYLE[mark],
                              locked && 'cursor-default opacity-70',
                            )}
                          >
                            <MarkIcon mark={mark} locked={locked} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {notes.constraints.length > 0 && (
        <section className="deco-panel p-4">
          <h3 className="text-gold mb-2 text-xs tracking-widest uppercase">Indizi aperti</h3>
          <ul className="text-paper-dim flex flex-col gap-1.5 text-xs">
            {notes.constraints.slice(-5).map((c, i) => (
              <li key={i}>
                <strong className="text-paper">{players.find((p) => p.id === c.playerId)?.name}</strong> ha
                almeno una fra le carte di quell&apos;ipotesi.
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-paper-dim px-1 text-xs leading-relaxed">
        Tocca una casella per scorrere fra <X className="inline size-3" /> non ce l&apos;ha,{' '}
        <HelpCircle className="inline size-3" /> forse, <Check className="inline size-3" /> ce l&apos;ha. Le
        caselle piu tenui sono dedotte dal gioco e non si modificano.
      </p>
    </div>
  )
}

const MARK_STYLE: Record<Mark, string> = {
  unknown: 'border-paper/10 bg-ink-2 text-paper/25',
  not: 'border-blood/40 bg-blood/15 text-blood-bright',
  maybe: 'border-mustard/50 bg-mustard/15 text-mustard',
  has: 'border-green/50 bg-green/20 text-green',
}

function MarkIcon({ mark, locked }: { mark: Mark; locked: boolean }) {
  // Le celle dedotte mostrano lo stesso simbolo di quelle manuali: la
  // differenza la fa il fatto che non rispondono al tocco. Un lucchetto su
  // meta griglia sarebbe solo rumore.
  void locked
  switch (mark) {
    case 'has':
      return <Check className="size-4" strokeWidth={3} />
    case 'not':
      return <X className="size-4" strokeWidth={3} />
    case 'maybe':
      return <HelpCircle className="size-4" strokeWidth={2.5} />
    default:
      return <Minus className="size-4" />
  }
}
