# Handoff

<!-- Written by the `end_task` tool, replaced whole on every patch. Do not edit by hand: the next close overwrites it. Target 150 lines, hard ceiling 200. -->

Il Cluedo e completo e verificato in locale, ma non ancora pubblicato. Il codice sta
in `D:\Games\Cluedo`, branch `main`, tre commit, working tree pulito.

## ATTENZIONE AL PERCORSO — la trappola che e costata piu tempo

Il progetto e nato in `D:\# Games\Cluedo` ed e stato spostato in `D:\Games\Cluedo` il
2026-08-19. Vite tronca i propri URL interni al carattere `#`: il dev server non serve
i moduli e la build "riesce" producendo un bundle in cui l'interop CJS di React e
rotta, con la pagina che muore a runtime su
`Cannot read properties of null (reading 'useCallback')`. Non e aggirabile: ne `subst`
ne una giunzione NTFS, perche Node risolve sempre il percorso reale. Se `D:\# Games\Cluedo`
esiste ancora e una copia stantia da cancellare. Su Vercel il problema non si presenta.

## Cosa e completo

- `src/engine/` — regole del Cluedo in TypeScript puro. Tabellone come mappa ASCII
  24x25 in `board/map.ts`: parser, pathfinding, rendering SVG e validazione derivano
  tutti da li, quindi modificare quella stringa modifica il gioco. 9 stanze, 17 porte
  con la distribuzione classica, due passaggi segreti fra angoli opposti, 218
  corridoi tutti connessi (verificato da test).
- `src/net/` — `Transport` come interfaccia, con `LocalTransport` (BroadcastChannel)
  e `SupabaseTransport`. La scelta e automatica in `createTransport` in base alla
  presenza delle variabili d'ambiente.
- `src/routes/tv/` e `src/routes/phone/` — le due applicazioni, caricate pigramente
  per rotta cosi che un telefono non scarichi il codice della TV.
- `public/assets/` — 32 SVG originali generati da `scripts/gen-assets.mjs`, piu le
  icone PWA in PNG. Nessun materiale Hasbro: e una scelta deliberata, non una
  mancanza da colmare scaricando immagini.
- `vercel.json`, `.github/workflows/ci.yml`, README con le istruzioni di deploy.

## Cosa manca, in ordine

1. `git remote add origin` + push (branch `main`, gia allineato con la CI).
2. Progetto Vercel collegato al repository.
3. Progetto Supabase (piano gratuito, nessuna tabella) e le due variabili
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` su Vercel e in `.env` locale.
   **Finche mancano, i telefoni non possono connettersi**: il gioco ripiega su
   BroadcastChannel e funziona solo fra schede dello stesso browser. Se arriva la
   segnalazione "non funziona coi telefoni", questa e la prima ipotesi, non un bug
   nel livello di rete.

## Cosa e fragile

- **La TV e l'host.** Se la scheda `/tv` si chiude la partita si ferma. Riprende
  ricaricando, perche lo stato e salvato in `localStorage` con scadenza 12 ore.
- **Nessuna deduplicazione degli intenti.** `practices/realtime-sessions.md` chiede
  che un `ROLL_DICE` ridondante non tiri due volte; oggi il reducer si difende solo
  perche la fase cambia dopo il primo tiro. Un id di intento sarebbe piu solido.
- **Nessuna via d'uscita se chi deve confutare sparisce.** La fase
  `resolving_suggestion` con `awaitingFrom` puntato a un telefono morto blocca il
  turno. E il rischio realtime piu concreto rimasto.
- **`turnTimeLimit`** esiste in `GameConfig` ma non e usato da nessuna parte.
- Il mini-tabellone sul telefono ha caselle sotto i 44px: si tocca, ma il percorso
  principale sono i pulsanti "stanze a portata", non la griglia.

## Da non rifare

- Non reintrodurre `manualChunks` in `vite.config.ts`: separare a mano React dalle
  librerie che lo usano produce due istanze di React e un dispatcher nullo.
- Non spostare le regole dentro i componenti: il motore e puro apposta.
- Non far passare carte dal canale pubblico. `toPublicState` e l'unico confine, ed e
  presidiato da un test che cerca ogni carta distribuita nel JSON trasmesso.
