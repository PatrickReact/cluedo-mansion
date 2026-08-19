import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-gold text-4xl">Vicolo cieco</h1>
      <p className="text-paper-dim max-w-sm">
        Questa stanza non esiste nella magione. Nemmeno un passaggio segreto porta qui.
      </p>
      <Link to="/" className="btn btn-primary">
        Torna all&apos;ingresso
      </Link>
    </main>
  )
}
