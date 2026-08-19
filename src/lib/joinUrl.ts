/**
 * URL che finisce nel QR mostrato dalla TV.
 *
 * Il codice stanza sta nel FRAGMENT (#) e non nella query: i frammenti non
 * vengono inviati al server ne finiscono nei log di Vercel, quindi il codice
 * resta fra la TV e i telefoni che lo inquadrano.
 */
export function joinUrl(roomCode: string): string {
  const base =
    import.meta.env.VITE_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base.replace(/\/$/, '')}/play#${roomCode.toUpperCase()}`
}

/** Legge il codice stanza dal fragment, se presente. */
export function roomCodeFromHash(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hash.replace(/^#/, '').toUpperCase().slice(0, 6)
}
