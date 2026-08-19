import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * SCUOTI PER TIRARE I DADI
 *
 * Usa l'accelerometro del telefono. Due complicazioni reali:
 *
 *  1. iOS 13+ richiede un permesso esplicito, concedibile SOLO dentro un
 *     gesto dell'utente. Quindi non si puo chiedere all'avvio: serve un tocco
 *     su un pulsante. Da qui `requestPermission`.
 *  2. Il sensore esiste solo in contesto sicuro (HTTPS o localhost). Provando
 *     dal telefono su http://192.168.x.x non c'e. Per questo il tiro deve
 *     restare sempre disponibile anche come semplice tocco: lo scuotimento e
 *     un di piu, mai l'unica strada.
 */

export type ShakePermission = 'unsupported' | 'prompt' | 'granted' | 'denied'

interface DeviceMotionEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

interface UseShakeOptions {
  /** Soglia di accelerazione in m/s^2. Piu alta = servono scossoni piu decisi. */
  readonly threshold?: number
  /** Intervallo minimo fra due tiri, in ms. */
  readonly cooldown?: number
  readonly enabled?: boolean
  readonly onShake: () => void
}

/** Stato iniziale del permesso, letto una volta sola all'avvio. */
function detectPermission(): ShakePermission {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return 'unsupported'
  const dme = window.DeviceMotionEvent as unknown as DeviceMotionEventStatic
  // Su iOS il permesso e esplicito; altrove il sensore e gia disponibile.
  return typeof dme.requestPermission === 'function' ? 'prompt' : 'granted'
}

export function useShake({ threshold = 22, cooldown = 1200, enabled = true, onShake }: UseShakeOptions) {
  const [permission, setPermission] = useState<ShakePermission>(detectPermission)
  const lastFire = useRef(0)
  const callback = useRef(onShake)

  // Il riferimento si aggiorna fuori dal render: il gestore dell'evento resta
  // registrato una volta sola ma chiama sempre l'ultima callback.
  useEffect(() => {
    callback.current = onShake
  }, [onShake])

  const requestPermission = useCallback(async (): Promise<ShakePermission> => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return 'unsupported'
    const dme = window.DeviceMotionEvent as unknown as DeviceMotionEventStatic
    if (typeof dme.requestPermission !== 'function') {
      setPermission('granted')
      return 'granted'
    }
    try {
      const result = await dme.requestPermission()
      const next: ShakePermission = result === 'granted' ? 'granted' : 'denied'
      setPermission(next)
      return next
    } catch {
      setPermission('denied')
      return 'denied'
    }
  }, [])

  useEffect(() => {
    if (!enabled || permission !== 'granted') return

    const handler = (event: DeviceMotionEvent): void => {
      const a = event.accelerationIncludingGravity
      if (!a) return
      // Modulo del vettore meno la gravita: isola il gesto dallo stare fermo.
      const magnitude = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) - 9.81
      if (Math.abs(magnitude) < threshold) return

      const now = Date.now()
      if (now - lastFire.current < cooldown) return
      lastFire.current = now

      // Vibrazione di conferma dove supportata.
      navigator.vibrate?.([30, 40, 60])
      callback.current()
    }

    window.addEventListener('devicemotion', handler)
    return () => window.removeEventListener('devicemotion', handler)
  }, [enabled, permission, threshold, cooldown])

  return { permission, requestPermission }
}
