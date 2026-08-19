/**
 * LETTURA DELLA CONFIGURAZIONE SUPABASE — un solo punto in tutto il progetto.
 *
 * Sta qui e non sparsa fra i moduli perche i nomi delle variabili cambiano:
 * Supabase ha sostituito le vecchie chiavi JWT (`anon`, `service_role`) con le
 * nuove `sb_publishable_…` e `sb_secret_…`, e un progetto puo trovarsi con
 * l'una o l'altra convenzione. Se la lettura fosse duplicata, aggiungere un
 * nome significherebbe ricordarsene in tre file.
 *
 * ATTENZIONE ALLE CHIAVI SEGRETE. Vite sostituisce ogni `import.meta.env.VITE_*`
 * con il suo valore letterale dentro il bundle: quello che ha il prefisso
 * `VITE_` finisce nel JavaScript servito a chiunque apra il sito. La chiave
 * pubblicabile e pensata per questo ed e innocua; la chiave segreta scavalca le
 * policy RLS e da accesso completo al database. Per questo qui NON viene mai
 * letta, e se la si trova configurata il gioco lo dice a voce alta invece di
 * usarla in silenzio.
 */

/** Prefisso delle chiavi segrete nella nuova nomenclatura Supabase. */
const SECRET_PREFIX = 'sb_secret_'

export interface SupabaseConfig {
  readonly url: string
  readonly key: string
}

/** Un problema di configurazione, in una frase leggibile da chi non l'ha scritta. */
export interface SupabaseProblem {
  readonly severity: 'error' | 'warning'
  readonly message: string
}

const trimmed = (value: string | undefined): string => (value ?? '').trim()

/*
 * NOTA CRITICA sull'accesso alle variabili.
 *
 * Ogni chiave va letta SINGOLARMENTE, con `import.meta.env.VITE_QUALCOSA`.
 * Vite sostituisce staticamente le singole letture con il loro valore, ma se
 * si tocca `import.meta.env` come oggetto intero le inlinea TUTTE — comprese
 * quelle che non si volevano nel bundle. E successo davvero qui: un innocuo
 * `const env = () => import.meta.env` ha depositato una chiave segreta nel
 * JavaScript di produzione. Non accorparle mai in un helper.
 */

/**
 * La chiave pubblicabile, con i due nomi accettati.
 *
 * `VITE_SUPABASE_PUBLISHABLE_KEY` e la nomenclatura corrente;
 * `VITE_SUPABASE_ANON_KEY` e quella storica, ancora validissima.
 */
const publishableKey = (): string =>
  trimmed(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) || trimmed(import.meta.env.VITE_SUPABASE_ANON_KEY)

/** true se la stringa e una chiave segreta e non deve stare in un browser. */
export const isSecretKey = (key: string): boolean => key.startsWith(SECRET_PREFIX)

/**
 * La configurazione utilizzabile, oppure `null` se manca o non e valida.
 * In assenza il gioco ripiega su BroadcastChannel.
 */
export function readSupabaseConfig(): SupabaseConfig | null {
  const url = trimmed(import.meta.env.VITE_SUPABASE_URL)
  const key = publishableKey()
  if (!url || !key) return null
  // Una chiave segreta configurata al posto di quella pubblicabile e un errore
  // di sicurezza, non un dettaglio: meglio non partire che pubblicarla.
  if (isSecretKey(key)) return null
  return { url, key }
}

export const hasSupabaseConfig = (): boolean => readSupabaseConfig() !== null

/**
 * Diagnostica della configurazione, per dirlo all'utente invece di limitarsi a
 * non funzionare. L'ordine conta: prima i problemi di sicurezza.
 */
export function supabaseProblems(): SupabaseProblem[] {
  const problems: SupabaseProblem[] = []
  const url = trimmed(import.meta.env.VITE_SUPABASE_URL)
  const key = publishableKey()

  // Le chiavi segrete configurate per errore NON si controllano qui: leggerle
  // significherebbe inlinearle nel bundle, cioe causare esattamente il problema
  // che si vuole segnalare. Se ne occupa il guardiano in vite.config.ts, che
  // ferma la build prima che il valore possa finire da qualche parte.
  if (isSecretKey(key)) {
    problems.push({
      severity: 'error',
      message:
        'La chiave configurata e segreta (sb_secret_…), non pubblicabile. Usa la chiave ' +
        'publishable / anon: e l unica pensata per stare in un browser.',
    })
  }

  if (url && !key) {
    problems.push({
      severity: 'warning',
      message: 'Manca la chiave: imposta VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY).',
    })
  }
  if (!url && key) {
    problems.push({ severity: 'warning', message: 'Manca VITE_SUPABASE_URL.' })
  }
  if (url && !/^https:\/\/[^.]+\.supabase\./.test(url)) {
    problems.push({
      severity: 'warning',
      message: `VITE_SUPABASE_URL non ha l aspetto di un URL Supabase: ${url}`,
    })
  }

  return problems
}

/**
 * Stampa i problemi in console all'avvio.
 *
 * Le variabili si leggono a tempo di build: se qualcuno aggiunge una chiave al
 * .env senza riavviare Vite, il bundle continua a non averla e il gioco sembra
 * rotto senza motivo. Dirlo in console fa risparmiare mezz'ora.
 */
export function reportSupabaseProblems(): void {
  for (const problem of supabaseProblems()) {
    const prefix = problem.severity === 'error' ? '[Cluedo] SICUREZZA:' : '[Cluedo]'
    if (problem.severity === 'error') console.error(prefix, problem.message)
    else console.warn(prefix, problem.message)
  }
}
