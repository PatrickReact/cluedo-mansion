import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import './index.css'
import { Home } from './routes/Home'
import { NotFound } from './routes/NotFound'

/**
 * TV e telefono sono due applicazioni disgiunte: la TV non usa mai il
 * taccuino, il telefono non disegna mai la cronaca. Caricarle separatamente
 * evita di far scaricare a un telefono in 4G il codice dello schermo grande.
 */
const TvScreen = lazy(() => import('./routes/tv/TvScreen').then((m) => ({ default: m.TvScreen })))
const PhoneScreen = lazy(() => import('./routes/phone/PhoneScreen').then((m) => ({ default: m.PhoneScreen })))

function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <p className="font-display text-gold animate-pulse text-2xl">Si prepara la magione…</p>
    </main>
  )
}

const withSuspense = (node: React.ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/tv', element: withSuspense(<TvScreen />) },
  { path: '/play', element: withSuspense(<PhoneScreen />) },
  { path: '*', element: <NotFound /> },
])

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root non trovato in index.html')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
