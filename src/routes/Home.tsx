import { Link } from 'react-router-dom'
import { Monitor, Smartphone, ShieldAlert } from 'lucide-react'
import { hasSupabase } from '@/net/createTransport'
import { supabaseProblems } from '@/net/supabaseConfig'
import { cn } from '@/lib/cn'

/**
 * Schermata di ingresso: smista verso i due ruoli.
 *
 * Si apre sia dalla TV sia dal telefono, quindi le due scelte devono essere
 * distinguibili a colpo d'occhio da entrambe le distanze.
 */
export function Home() {
  const problems = supabaseProblems()

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-10 p-6">
      <header className="text-center">
        <img src="/assets/logo.svg" alt="Cluedo — Tudor Mansion" className="mx-auto w-full max-w-md" />
        <p className="text-paper-dim mt-6 text-balance">
          La mappa vive sulla TV. Ogni giocatore usa il proprio telefono come taccuino, dadi e mano di carte.
        </p>
      </header>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Link
          to="/tv"
          className="deco-panel group flex flex-col items-center gap-3 p-8 text-center transition hover:brightness-125"
        >
          <Monitor className="text-gold size-10" strokeWidth={1.4} />
          <span className="font-display text-2xl">Apri la TV</span>
          <span className="text-paper-dim text-sm">
            Lo schermo grande: tabellone, movimenti, dadi e cronaca del delitto.
          </span>
        </Link>

        <Link
          to="/play"
          className="deco-panel group flex flex-col items-center gap-3 p-8 text-center transition hover:brightness-125"
        >
          <Smartphone className="text-gold size-10" strokeWidth={1.4} />
          <span className="font-display text-2xl">Entra come giocatore</span>
          <span className="text-paper-dim text-sm">
            Inquadra il QR sulla TV oppure digita il codice stanza.
          </span>
        </Link>
      </div>

      {/*
        La diagnostica è esplicita di proposito: la modalità locale funziona
        benissimo fra schede dello stesso browser, quindi dal comportamento è
        impossibile accorgersi che i telefoni non si collegheranno mai.
      */}
      {problems.length > 0 && (
        <div className="flex w-full max-w-xl flex-col gap-3">
          {problems.map((problem, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-sm',
                problem.severity === 'error'
                  ? 'border-blood/60 bg-blood/15 text-blood-bright'
                  : 'border-mustard/50 bg-mustard/10 text-mustard',
              )}
            >
              <ShieldAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} />
              <p>{problem.message}</p>
            </div>
          ))}
        </div>
      )}

      {!hasSupabase() && (
        <div className="deco-panel flex max-w-xl items-start gap-3 p-4 text-sm">
          <ShieldAlert className="text-gold mt-0.5 size-5 shrink-0" strokeWidth={1.6} />
          <p className="text-paper-dim">
            <strong className="text-paper">Modalità locale.</strong> Il gioco funziona solo fra schede dello
            stesso browser — utile per provarlo, inutile con i telefoni. Servono{' '}
            <code className="bg-ink-4 rounded px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code> e{' '}
            <code className="bg-ink-4 rounded px-1 py-0.5 text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code>, poi{' '}
            <strong className="text-paper">riavvia il server</strong>: Vite legge il .env solo all&apos;avvio.
          </p>
        </div>
      )}
    </main>
  )
}
