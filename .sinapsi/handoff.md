# Handoff

<!-- Written by the `end_task` tool, replaced whole on every patch. Do not edit by hand: the next close overwrites it. Target 150 lines, hard ceiling 200. -->

Cluedo completo e in produzione. Codice in `D:\Games\Cluedo`, branch `main`,
remote `PatrickReact/cluedo-mansion`, working tree pulito, `npm run check` verde
(81 test).

## ATTENZIONE AL PERCORSO

Il progetto e nato in `D:\# Games\Cluedo` ed e stato spostato. Vite tronca i
propri URL interni al carattere `#`: il dev server non serve i moduli e la build
"riesce" producendo un bundle in cui l'interop CJS di React e rotta, con la
pagina che muore su `Cannot read properties of null (reading 'useCallback')`.
Non e aggirabile — ne `subst` ne una giunzione, perche Node risolve il percorso
reale. Se il progetto finisce sotto un percorso con `#`, spostalo.

## Cosa e completo

- `src/engine/` — regole del Cluedo in TypeScript puro. Tabellone come mappa
  ASCII 24x25, 9 stanze, 17 porte, due passaggi segreti. `MIN_PLAYERS = 3` e
  fedele al regolamento e NON va abbassato: in due la busta si deduce in pochi
  turni, da soli si riceverebbero tutte le carte. I posti si riempiono con bot.
- `src/bots/` — avversari automatici. Vedi sotto.
- `src/net/` — trasporto dietro interfaccia: BroadcastChannel in locale,
  Supabase Realtime in produzione.
- TV e telefono, con caricamento pigro per rotta.
- 21 carte, come il Cluedo classico. Nessuna carta speciale manca: Intrigue,
  Keeper e Clock appartengono a "Discover the Secrets" (2008), che e una
  variante con tabellone e regolamento diversi, non il gioco base.

## I bot, in breve

Onesta STRUTTURALE, da non erodere: `driver.ts` possiede il `GameState` ma
passa a `decide()` solo `toPublicState(game)` e `toPrivateState(game, botId)`.
Due test lo verificano dall'esterno cambiando la soluzione nascosta e le mani
altrui: la mossa deve restare identica. Se qualcuno passasse lo stato intero
per comodita, quei test si rompono — ed e il punto.

Ragionamento: deduzione esatta con `computeNotes` (condiviso col taccuino
umano, UNA sola implementazione delle regole di deduzione) piu campionamento
di mondi coerenti per la parte incerta. Le ipotesi si scelgono per guadagno di
informazione atteso.

Livelli: facile 250 mondi / medio 1200 / difficile 3000. Cambiano la profondita
di analisi, MAI cio che il bot vede.

## Cosa manca

1. Credenziali Supabase su Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
   Finche mancano i telefoni NON si collegano: il gioco ripiega su
   BroadcastChannel e funziona solo fra schede dello stesso browser. Se arriva
   "non funziona coi telefoni", questa e la prima ipotesi, non un bug di rete.

## Cosa e fragile

- **La TV e l'host.** Chiuderla ferma la partita (riprende ricaricando: stato e
  memoria dei bot sono in localStorage, 12 ore).
- **Nessuna via d'uscita se chi deve confutare sparisce.** La fase
  `resolving_suggestion` con `awaitingFrom` su un telefono morto blocca il turno.
  E il rischio realtime piu concreto rimasto.
- **Nessuna deduplicazione degli intenti**: un `ROLL_DICE` redatto due volte e
  respinto solo perche la fase e gia cambiata. Un id di intento sarebbe piu solido.
- **`turnTimeLimit`** esiste in `GameConfig` ma non e usato.
- Il mini-tabellone sul telefono ha caselle sotto i 44px.

## Da non rifare

- Non reintrodurre `manualChunks` in `vite.config.ts`: separare React dalle
  librerie che lo usano produce due istanze e un dispatcher nullo.
- Non far valutare a `roomValue` tutte le 36 ipotesi per ognuna delle 9 stanze:
  costava due ordini di grandezza e non cambiava la classifica.
- Non aggiungere `.sinapsi/` al formatter: la CI fallisce e la rotazione della
  memoria si corrompe.
- Non spostare regole nei componenti, e non far passare carte dal canale
  pubblico: `toPublicState` e l'unico confine, presidiato da un test.
