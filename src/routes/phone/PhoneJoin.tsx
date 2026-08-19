import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { SUSPECTS } from '@/engine/constants'
import type { SuspectId } from '@/engine/constants'
import type { PublicState } from '@/engine/redact'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomCode'
import { cn } from '@/lib/cn'

interface PhoneJoinProps {
  readonly initialCode: string
  readonly initialName: string
  readonly publicState: PublicState | null
  readonly connecting: boolean
  readonly error: string | null
  readonly onPeek: (code: string) => void
  readonly onJoin: (code: string, name: string, suspect: SuspectId) => void
}

/**
 * Ingresso dal telefono, in due passi.
 *
 * Chi arriva dal QR ha già il codice nel fragment e vede direttamente la
 * scelta del personaggio: un tocco e sta giocando. Chi digita il codice a mano
 * passa dal primo passo.
 */
export function PhoneJoin({
  initialCode,
  initialName,
  publicState,
  connecting,
  error,
  onPeek,
  onJoin,
}: PhoneJoinProps) {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(initialName)
  const [suspect, setSuspect] = useState<SuspectId | null>(null)

  const codeReady = isValidRoomCode(code)

  // Appena il codice è completo ci si collega per vedere chi è già dentro:
  // così i personaggi occupati risultano subito indisponibili.
  useEffect(() => {
    if (codeReady) onPeek(code)
  }, [code, codeReady, onPeek])

  const taken = new Set(publicState?.players.filter((p) => !p.isNpc).map((p) => p.suspect) ?? [])
  const canSubmit = codeReady && name.trim().length > 0 && suspect !== null && !connecting

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3">
        <Link to="/" className="btn btn-ghost !min-h-10 !px-3">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-gold text-2xl">Entra nella magione</h1>
      </header>

      {/* --- codice stanza --- */}
      <label className="flex flex-col gap-2">
        <span className="text-paper-dim text-sm tracking-widest uppercase">Codice stanza</span>
        <input
          value={code}
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          placeholder="ABC123"
          className="border-gold/40 bg-ink-2 font-display text-paper focus:border-gold rounded-xl border px-4 py-4 text-center text-4xl tracking-[0.3em] uppercase outline-none"
        />
        <span className="text-paper-dim text-xs">Lo trovi sulla TV, sotto il codice QR.</span>
      </label>

      {/* --- nome --- */}
      <label className="flex flex-col gap-2">
        <span className="text-paper-dim text-sm tracking-widest uppercase">Il tuo nome</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 24))}
          autoComplete="given-name"
          placeholder="Come ti chiamano al tavolo"
          className="border-paper/15 bg-ink-2 text-paper focus:border-gold rounded-xl border px-4 py-3.5 text-lg outline-none"
        />
      </label>

      {/* --- personaggio --- */}
      <section className="flex flex-col gap-3">
        <span className="text-paper-dim text-sm tracking-widest uppercase">Scegli il sospetto</span>
        <div className="grid grid-cols-3 gap-3">
          {SUSPECTS.map((s) => {
            const isTaken = taken.has(s.id)
            const selected = suspect === s.id
            return (
              <button
                key={s.id}
                type="button"
                disabled={isTaken}
                onClick={() => setSuspect(s.id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border p-2 transition',
                  selected ? 'border-gold bg-gold/15' : 'border-paper/10 bg-ink-2',
                  isTaken && 'opacity-30',
                )}
              >
                <img
                  src={`/assets/suspects/${s.id}.svg`}
                  alt=""
                  className="aspect-[200/260] w-full rounded-lg object-cover"
                />
                <span className="text-paper-dim text-xs leading-tight">{s.shortName}</span>
              </button>
            )
          })}
        </div>
        {publicState && taken.size > 0 && (
          <p className="text-paper-dim text-xs">
            {taken.size} {taken.size === 1 ? 'sospetto già scelto' : 'sospetti già scelti'}.
          </p>
        )}
      </section>

      {error && (
        <p className="border-blood/50 bg-blood/15 text-blood-bright rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => suspect && onJoin(code, name.trim(), suspect)}
        className="btn btn-primary mt-auto w-full text-lg"
      >
        {connecting ? <LoaderCircle className="size-5 animate-spin" /> : null}
        {connecting ? 'Collegamento…' : 'Entra'}
      </button>
    </main>
  )
}
