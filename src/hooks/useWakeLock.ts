import { useEffect, useRef } from 'react'

/**
 * Tiene acceso lo schermo.
 *
 * Serve su entrambi i lati: la TV non deve andare in standby a meta partita e
 * il telefono non deve bloccarsi mentre si aspetta il proprio turno. L'API non
 * esiste ovunque (Safari l'ha aggiunta tardi), quindi ogni errore e ignorato:
 * al peggio lo schermo si spegne come farebbe normalmente.
 */
export function useWakeLock(active = true): void {
  const sentinel = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let cancelled = false

    const acquire = async (): Promise<void> => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        sentinel.current = lock
      } catch {
        // Permesso negato o batteria scarica: si prosegue senza.
      }
    }

    // Il blocco cade quando la scheda passa in secondo piano: va riacquisito.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && !sentinel.current) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel.current?.release()
      sentinel.current = null
    }
  }, [active])
}
