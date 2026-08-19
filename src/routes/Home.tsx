import { Link } from 'react-router-dom'
import { Monitor, Smartphone, ShieldAlert } from 'lucide-react'
import { hasSupabase } from '@/net/createTransport'

/**
 * Schermata di ingresso: smista verso i due ruoli.
 *
 * Si apre sia dalla TV sia dal telefono, quindi le due scelte devono essere
 * distinguibili a colpo d'occhio da entrambe le distanze.
 */
export function Home() {
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

      {!hasSupabase() && (
        <div className="deco-panel flex max-w-xl items-start gap-3 p-4 text-sm">
          <ShieldAlert className="text-gold mt-0.5 size-5 shrink-0" strokeWidth={1.6} />
          <p className="text-paper-dim">
            <strong className="text-paper">Modalità locale.</strong> Manca la configurazione realtime, quindi
            il gioco funziona solo fra schede dello stesso browser — utile per provarlo subito. Per giocare
            davvero con i telefoni servono le variabili{' '}
            <code className="bg-ink-4 rounded px-1 py-0.5 text-xs">VITE_SUPABASE_*</code>: vedi il README.
          </p>
        </div>
      )}
    </main>
  )
}
