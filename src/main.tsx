import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import './index.css'
import { reportSupabaseProblems } from './net/supabaseConfig'
import { Home } from './routes/Home'
import { NotFound } from './routes/NotFound'
import { Loading } from './ui/Loading'

/**
 * TV e telefono sono due applicazioni disgiunte: la TV non usa mai il
 * taccuino, il telefono non disegna mai la cronaca. Caricarle separatamente
 * evita di far scaricare a un telefono in 4G il codice dello schermo grande.
 */
const TvScreen = lazy(() => import('./routes/tv/TvScreen').then((m) => ({ default: m.TvScreen })))
const PhoneScreen = lazy(() => import('./routes/phone/PhoneScreen').then((m) => ({ default: m.PhoneScreen })))

const lazily = (node: React.ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/tv', element: lazily(<TvScreen />) },
  { path: '/play', element: lazily(<PhoneScreen />) },
  { path: '*', element: <NotFound /> },
])

// Le variabili si leggono a tempo di build: chi ne aggiunge una senza
// riavviare Vite ha un bundle che non la contiene, e il gioco sembra rotto
// senza motivo. Dirlo in console fa risparmiare mezz'ora.
reportSupabaseProblems()

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root non trovato in index.html')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
