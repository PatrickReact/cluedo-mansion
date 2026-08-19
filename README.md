# Cluedo — Tudor Mansion

Cluedo multiplayer per il salotto: **la TV mostra la magione**, **i telefoni sono i giocatori**.

Sullo schermo grande vivono il tabellone, le pedine che si muovono, i dadi, le armi e la cronaca
del delitto. Sul telefono ognuno ha il proprio taccuino, la propria mano di carte e i pulsanti per
agire — scuotere per tirare i dadi, escludere sospetti, ipotizzare, accusare.

Nessuna carta compare mai sulla TV. È il vincolo che tiene in piedi il gioco, ed è verificato da
un test automatico.

---

## Indice

- [Avvio rapido](#avvio-rapido)
- [Come si gioca](#come-si-gioca)
- [Deploy su Vercel](#deploy-su-vercel)
- [Realtime: la configurazione Supabase](#realtime-la-configurazione-supabase)
- [Architettura](#architettura)
- [Il tabellone](#il-tabellone)
- [Le regole implementate](#le-regole-implementate)
- [Asset grafici](#asset-grafici)
- [Sviluppo](#sviluppo)
- [Limiti noti](#limiti-noti)

---

## Avvio rapido

```bash
npm install
npm run dev
```

Apri <http://localhost:5173/tv> in una scheda e <http://localhost:5173/play> in altre due o tre.
Senza alcuna configurazione il gioco usa **BroadcastChannel** e funziona fra schede dello stesso
browser: basta per vedere tutto in funzione, non basta per i telefoni.

Per giocare davvero con i telefoni serve il realtime: vedi
[Realtime](#realtime-la-configurazione-supabase).

> **Attenzione al percorso.** Vite non funziona se la cartella del progetto contiene un `#`.
> Vedi [Limiti noti](#limiti-noti).

---

## Come si gioca

1. **Apri la TV.** Un browser sulla smart TV (o un portatile collegato via HDMI) su `/tv`.
   Compare un QR gigante e un codice di sei caratteri.
2. **I giocatori entrano.** Ognuno inquadra il QR col telefono, oppure va sul dominio e digita il
   codice. Sceglie un sospetto fra i sei e un nome.
3. **Si comincia** da 3 giocatori in su, fino a 6.
4. **Al proprio turno**: scuoti il telefono (o tocca) per tirare i dadi, scegli dove muoverti fra le
   caselle illuminate sul tabellone, e una volta in una stanza dichiara un'ipotesi.
5. **La confutazione** avviene in privato: solo chi ha ipotizzato vede la carta, e la vede sul
   proprio telefono. Sulla TV compare unicamente _chi_ ha confutato.
6. **L'accusa** è una sola per partita. Se è giusta hai risolto il caso; se è sbagliata resti al
   tavolo solo per mostrare le carte.

La TV va tenuta aperta per tutta la partita: è lei che possiede lo stato. Se si ricarica per errore,
la partita riprende da dove era (è salvata in locale).

---

## Deploy su Vercel

Il progetto è una SPA statica: nessun backend da gestire, nessuna funzione serverless.

### 1. Repository GitHub

```bash
git init
git add .
git commit -m "Cluedo: primo impianto"
git branch -M main
git remote add origin https://github.com/<utente>/<repo>.git
git push -u origin main
```

### 2. Collega Vercel

Su [vercel.com](https://vercel.com) → **Add New… → Project** → importa il repository.
Vercel legge `vercel.json` e riconosce Vite da solo:

| Impostazione     | Valore          |
| ---------------- | --------------- |
| Framework Preset | Vite            |
| Build Command    | `npm run build` |
| Output Directory | `dist`          |
| Install Command  | `npm ci`        |

### 3. Variabili d'ambiente

In **Project Settings → Environment Variables**, per gli ambienti _Production_, _Preview_ e
_Development_:

| Nome                     | Valore                        |
| ------------------------ | ----------------------------- |
| `VITE_SUPABASE_URL`      | `https://xxxx.supabase.co`    |
| `VITE_SUPABASE_ANON_KEY` | la chiave `anon` del progetto |

Sono variabili `VITE_*`, quindi finiscono nel bundle e sono **pubbliche per costruzione**. Va bene:
la chiave `anon` di Supabase è pensata per stare nel client, e questo progetto non scrive nulla sul
database — usa solo i canali broadcast effimeri.

### 4. Autodeploy

Fatto: ogni `git push` su `main` pubblica in produzione, ogni pull request ottiene un'anteprima con
URL dedicato. Il workflow in `.github/workflows/ci.yml` gira in parallelo e verifica lint,
formattazione, test e build.

---

## Realtime: la configurazione Supabase

Serve solo per far parlare dispositivi diversi. Il piano gratuito è più che sufficiente: il gioco
non crea tabelle, non scrive righe, non autentica nessuno. Usa esclusivamente i messaggi broadcast.

1. Crea un progetto su [supabase.com](https://supabase.com) (piano gratuito).
2. **Project Settings → API**: copia _Project URL_ e la chiave _anon public_.
3. In locale, copia `.env.example` in `.env` e incolla i valori.
4. Su Vercel, inseriscili come variabili d'ambiente (sopra).

Non serve toccare lo schema del database, né le policy RLS, né l'autenticazione.

### Come sono protette le carte

Il modello di fiducia è quello di una partita in salotto: **chi vede la TV può giocare**.

- Il **codice stanza** compare solo sulla TV e nel QR. Non viaggia mai in chiaro sulla rete: sul filo
  passano soltanto i nomi dei canali, che sono suoi hash SHA-256.
- Il **canale pubblico** trasporta lo stato ripulito (`toPublicState`): niente mani, niente
  soluzione, niente carta mostrata. È esattamente quello che vede la TV.
- Ogni giocatore ha un **canale privato** il cui nome deriva da `hash(codice stanza + id giocatore)`:
  solo l'host e quel telefono possono calcolarlo.
- Nel QR il codice sta nel **fragment** (`/play#ABC123`), che i browser non inviano al server: non
  finisce nei log di Vercel.

Questo ferma un curioso in rete locale, non un attaccante determinato che conosce il codice stanza.
Per una partita fra amici è la proporzione giusta.

---

## Architettura

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│  TV  (/tv)   — HOST         │        │  Telefono (/play)        │
│                             │        │                          │
│  GameState completo         │◀──────▶│  PublicState  (ripulito) │
│  reducer = unica autorità   │ canali │  PrivateState (mia mano) │
│  salvataggio in localStorage│        │  taccuino deduttivo      │
└─────────────────────────────┘        └──────────────────────────┘
        pubblica stato                       manda INTENTI
```

Un solo principio regge tutto: **i telefoni mandano intenti, mai stato**. La TV li fa passare dal
reducer; se una mossa è illegale lo stato non si muove e al mittente torna il motivo. Nessun client
può barare perché nessun client calcola le regole.

```
src/
├── engine/              motore puro, zero React, 62 test
│   ├── constants.ts       sospetti, armi, stanze
│   ├── board/
│   │   ├── map.ts           IL TABELLONE, in ASCII — unica fonte di verità
│   │   ├── board.ts         parser ASCII → griglia tipizzata
│   │   └── pathfinding.ts   BFS con le regole di movimento del Cluedo
│   ├── rng.ts             PRNG deterministico: partite riproducibili
│   ├── reducer.ts         (stato, azione) → stato
│   ├── notes.ts           taccuino con deduzione automatica a punto fisso
│   └── redact.ts          separa ciò che è pubblico da ciò che è privato
├── net/                 astrazione di trasporto
│   ├── transport.ts       l'interfaccia
│   ├── localTransport.ts    BroadcastChannel (sviluppo, un solo browser)
│   └── supabaseTransport.ts Supabase Realtime (produzione)
├── store/               hostStore (TV) e playerStore (telefono)
├── routes/tv/           schermo grande
├── routes/phone/        controller
└── ui/                  Board.tsx, Die.tsx
```

### Perché queste scelte

- **Motore separato dalla UI.** Le regole del Cluedo sono la parte che vale la pena testare bene.
  Stanno in TypeScript puro, senza React: si testano in millisecondi e si possono riusare (un bot,
  una CLI, un altro front-end).
- **RNG con seed.** I dadi non usano `Math.random()`: lo stato del generatore fa parte dello stato
  della partita. Una partita è quindi riproducibile — utile per i test e per indagare i bug.
- **Trasporto dietro un'interfaccia.** Sostituire Supabase con PartyKit, Ably o un server proprio
  significa scrivere una classe che implementa `Transport`, e nient'altro.
- **Redazione esplicita.** `toPublicState` / `toPrivateState` sono l'unico punto in cui si decide
  cosa può uscire. Un test verifica che nessuna carta compaia mai sul canale pubblico.

---

## Il tabellone

Il tabellone è una **stringa ASCII** in [`src/engine/board/map.ts`](src/engine/board/map.ts):
24 colonne × 25 righe. Da lì derivano parser, pathfinding, rendering SVG e validazione delle mosse.
Modificare quella stringa modifica il gioco.

```
KKKKKK............CCCCCC
KKKKKK..BBBBBBBB..CCCCCC
...
OOOOOOO..HHHHHH..SSSSSSS
```

Topologia fedele all'originale: 9 stanze sul perimetro, cantina centrale con la busta, **17 porte**
distribuite come sul tabellone classico (Sala da ballo 4, Ingresso 3, Sala da pranzo / Biliardo /
Biblioteca 2, Cucina / Serra / Salotto / Studio 1) e i due passaggi segreti fra angoli opposti
(Cucina ↔ Studio, Serra ↔ Salotto).

Le **coordinate esatte** delle caselle sono una ricostruzione: Hasbro non pubblica una griglia
ufficiale. Sono state scelte per conservare proporzioni, numero di porte e distanze di gioco. Le
caselle di partenza danno distanze dalla prima stanza fra 4 e 7 passi, con Mrs. Peacock la più
vicina — come sul tabellone originale.

Un test verifica che i 218 corridoi siano tutti raggiungibili fra loro, che ogni porta colleghi una
soglia a un corridoio adiacente e che nessuna pedina parta fuori dal percorribile.

---

## Le regole implementate

Tratte dal regolamento classico e dalle istruzioni Hasbro correnti.

**Preparazione** — 21 carte (6 sospetti, 6 armi, 9 stanze). Una per tipo va nella busta; le 18
restanti si distribuiscono a giro. Con 4 o 5 giocatori le mani sono diseguali: è corretto, il
regolamento non prevede scarti. Le sei armi vanno una per stanza (a caso, oppure nelle stanze
classiche con l'opzione `classicWeaponPlacement`).

**Movimento** — due dadi. Spostamenti solo ortogonali, mai in diagonale né attraverso i muri. Non si
attraversa né ci si ferma su una casella occupata. Si entra in una stanza solo dalle porte: entrare
consuma un passo e **termina il movimento**, il resto del tiro si perde. **Non si può rientrare
nella stanza da cui si è usciti nello stesso turno.** Dagli angoli si può usare il passaggio segreto
al posto del tiro.

**Ipotesi** — solo dalla stanza in cui ci si trova. Il sospetto e l'arma nominati vengono trascinati
in quella stanza. Si interroga **in senso orario** a partire da sinistra: il primo che ha almeno una
delle tre carte **deve** mostrarne **una sola**, e solo a chi ha ipotizzato. Chi non ne ha passa, e
il fatto è pubblico. Chi viene trascinato in una stanza da un'ipotesi altrui può, al proprio turno,
ipotizzare da lì senza tirare (opzione `suggestionMoveGrantsSuggestion`, attiva).

**Accusa** — una sola per partita, al proprio turno, anche subito dopo un'ipotesi. Giusta: vinci.
Sbagliata: esci dai turni ma **continui a mostrare le carte** quando ti interrogano.

### Il taccuino

Le caselle che si possono dedurre dai fatti pubblici le compila il gioco, e le blocca:

- le carte in mano, e quindi il fatto che nessun altro le abbia;
- le carte viste durante una confutazione;
- chi ha passato non ha nessuna delle tre carte nominate;
- chi ha confutato ha almeno una delle tre (vincolo, risolto quando resta una sola possibilità);
- se una carta è esclusa per tutti, è nella busta;
- se un giocatore ha già tutte le carte della sua mano, non ha le altre.

La deduzione gira a punto fisso: ogni fatto nuovo può sbloccarne altri. Sono conti che chiunque, al
tavolo vero, potrebbe fare guardando chi passa e chi confuta: automatizzarli toglie la contabilità,
non il ragionamento. Le crocette manuali (`forse`, intuizioni, bluff) restano a carico del giocatore
e non sovrascrivono mai una deduzione certa.

---

## Asset grafici

Tutti gli asset in `public/assets` sono **originali**, generati proceduralmente in SVG:

```bash
npm run gen:assets
```

L'illustrazione ufficiale di Cluedo è proprietà di Hasbro e non è ridistribuibile in un repository
pubblico. Lo script [`scripts/gen-assets.mjs`](scripts/gen-assets.mjs) produce 6 ritratti, 6 pedine,
6 icone armi, 9 icone stanze, il dorso carta, il logo, la favicon e le icone PWA (PNG, scritte con
un encoder minimale — nessuna dipendenza).

Per usare illustrazioni proprie basta sostituire i file mantenendo i nomi. Per cambiare la palette
si modificano le costanti in cima allo script e si rigenera.

---

## Sviluppo

```bash
npm run dev          # server di sviluppo, in ascolto anche sulla LAN
npm run build        # build di produzione
npm run preview      # serve la build
npm test             # 62 test: regole, tabellone, rete, privacy
npm run test:watch
npm run test:cov     # copertura del motore
npm run lint         # oxlint
npm run format       # prettier
npm run check        # lint + test + build, come in CI
npm run gen:assets   # rigenera la grafica
```

### Provare dal telefono in locale

`npm run dev` espone anche l'IP di rete. Due avvertenze:

- **Serve Supabase**: BroadcastChannel non attraversa i dispositivi.
- Su `http://192.168.x.x` il browser non è in _contesto sicuro_, quindi mancano l'accelerometro
  (niente scuoti-per-tirare, resta il tocco) e `crypto.subtle` (i nomi dei canali usano un hash di
  ripiego). In produzione su HTTPS funziona tutto.

### Opzioni di partita

In `src/engine/setup.ts`, `DEFAULT_CONFIG`:

| Opzione                          | Default | Effetto                                                       |
| -------------------------------- | ------- | ------------------------------------------------------------- |
| `classicWeaponPlacement`         | `false` | armi nelle stanze classiche invece che a caso                 |
| `suggestionMoveGrantsSuggestion` | `true`  | chi è trascinato può ipotizzare senza tirare                  |
| `diceCount`                      | `2`     | numero di dadi                                                |
| `turnTimeLimit`                  | `0`     | secondi per turno, 0 = nessun limite (non ancora usato in UI) |

---

## Limiti noti

**Il percorso del progetto non può contenere `#`.** Vite tronca gli URL interni al carattere `#`:
il server di sviluppo non parte e la build produce un bundle in cui l'interop di React si rompe a
runtime (`Cannot read properties of null (reading 'useCallback')`). Non è aggirabile da
configurazione — né `subst` né una giunzione aiutano, perché Node risolve sempre il percorso reale.
Se la cartella si trova sotto un percorso con `#`, spostala:

```bash
# da  D:\# Games\Cluedo   a   D:\Games\Cluedo
```

Su Vercel il problema non si pone: il percorso di build è pulito.

**Altri limiti:**

- La TV deve restare aperta: è lei l'host. Chiuderla ferma la partita (che però riprende ricaricando).
- Una sola partita per browser sulla TV: lo stato salvato è unico.
- `turnTimeLimit` è nel modello ma non ancora esposto nell'interfaccia.
- Non c'è un bot: servono almeno 3 persone vere.

---

## Licenza e marchi

Cluedo® e Clue® sono marchi registrati di Hasbro. Questo è un progetto amatoriale, non affiliato né
approvato da Hasbro, che non contiene né ridistribuisce materiale protetto: le regole non sono
tutelabili, e tutta la grafica è originale e generata dallo script incluso.
