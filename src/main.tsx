import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import './index.css'
import { Home } from './routes/Home'
import { TvScreen } from './routes/tv/TvScreen'
import { PhoneScreen } from './routes/phone/PhoneScreen'
import { NotFound } from './routes/NotFound'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/tv', element: <TvScreen /> },
  { path: '/play', element: <PhoneScreen /> },
  { path: '*', element: <NotFound /> },
])

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root non trovato in index.html')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
