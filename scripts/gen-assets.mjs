#!/usr/bin/env node
/**
 * Generatore degli asset grafici.
 *
 * Perche generati e non scaricati: l'illustrazione ufficiale di Cluedo e
 * proprieta di Hasbro e non e ridistribuibile in un repo pubblico. Questi
 * asset sono originali, disegnati proceduralmente in SVG, quindi liberi da
 * vincoli e modificabili: cambiare una palette qui si propaga a tutto il
 * gioco. Per sostituirli con illustrazioni proprie basta rimpiazzare i file
 * in public/assets mantenendo i nomi.
 *
 *   node scripts/gen-assets.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'assets')

// ------------------------------------------------------------------ palette

const INK = '#0b0a12'
const PAPER = '#f4efe4'
const GOLD = '#c9a227'
const BLOOD = '#8c1428'

const SUSPECTS = [
  { id: 'scarlett', label: 'S', color: '#e0364f', dark: '#8c1428', hair: '#2b1418', ink: '#fff' },
  { id: 'mustard', label: 'M', color: '#e3a72c', dark: '#8f6208', hair: '#4a3a10', ink: '#241a00' },
  { id: 'white', label: 'W', color: '#e8e6e1', dark: '#9a978f', hair: '#b9b4aa', ink: '#1a1a1a' },
  { id: 'green', label: 'G', color: '#2fa15c', dark: '#0d5c32', hair: '#1d2b1f', ink: '#fff' },
  { id: 'peacock', label: 'P', color: '#3672d1', dark: '#173e7d', hair: '#16233d', ink: '#fff' },
  { id: 'plum', label: 'L', color: '#8b4fd0', dark: '#4a2178', hair: '#2a1740', ink: '#fff' },
]

// --------------------------------------------------------------- primitive

const svg = (w, h, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${extra}>\n${body}\n</svg>\n`

const write = (name, content) => {
  writeFileSync(join(OUT, name), content)
  return name
}

/** Cornice art-deco a smusso, usata da ritratti e tessere stanza. */
const decoFrame = (w, h, stroke, cut = 14, width = 3) => {
  const p = [
    `M ${cut} 2`,
    `H ${w - cut}`,
    `L ${w - 2} ${cut}`,
    `V ${h - cut}`,
    `L ${w - cut} ${h - 2}`,
    `H ${cut}`,
    `L 2 ${h - cut}`,
    `V ${cut}`,
    'Z',
  ].join(' ')
  return `<path d="${p}" fill="none" stroke="${stroke}" stroke-width="${width}" />`
}

// ---------------------------------------------------------------- personaggi

/**
 * Ritratto: silhouette a mezzo busto su fondo tinta del personaggio,
 * dentro una cornice deco. Leggibile sia a 40px sul telefono sia a 300px in TV.
 */
function suspectPortrait(s) {
  const W = 200
  const H = 260
  return svg(
    W,
    H,
    `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" />
      <stop offset="100%" stop-color="${s.dark}" />
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="38%" r="70%">
      <stop offset="60%" stop-color="#000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000" stop-opacity="0.45" />
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="10" fill="url(#bg)" />

  <!-- alone dietro la figura -->
  <ellipse cx="100" cy="118" rx="62" ry="66" fill="#000" opacity="0.16" />

  <!-- spalle -->
  <path d="M 34 260 C 34 196 62 168 100 168 C 138 168 166 196 166 260 Z" fill="${s.hair}" opacity="0.92" />
  <!-- colletto -->
  <path d="M 100 168 L 82 210 L 100 226 L 118 210 Z" fill="${PAPER}" opacity="0.85" />
  <!-- testa -->
  <ellipse cx="100" cy="118" rx="40" ry="46" fill="${s.hair}" />
  <!-- luce laterale -->
  <path d="M 100 72 A 40 46 0 0 1 100 164 Z" fill="#fff" opacity="0.07" />

  <rect width="${W}" height="${H}" rx="10" fill="url(#vig)" />
  ${decoFrame(W, H, GOLD, 16, 2.5)}
  <circle cx="100" cy="34" r="17" fill="${INK}" opacity="0.55" />
  <text x="100" y="41" font-family="Georgia,serif" font-size="20" font-weight="bold"
        text-anchor="middle" fill="${GOLD}">${s.label}</text>
`,
  )
}

/** Pedina vista dall'alto, disegnata sul tabellone. */
function suspectToken(s) {
  const W = 64
  return svg(
    W,
    W,
    `
  <defs>
    <radialGradient id="t" cx="38%" cy="32%" r="72%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.55" />
      <stop offset="45%" stop-color="${s.color}" />
      <stop offset="100%" stop-color="${s.dark}" />
    </radialGradient>
  </defs>
  <circle cx="32" cy="34" r="26" fill="#000" opacity="0.28" />
  <circle cx="32" cy="32" r="26" fill="url(#t)" stroke="${INK}" stroke-width="2.5" />
  <circle cx="32" cy="32" r="20" fill="none" stroke="#fff" stroke-width="1" opacity="0.35" />
  <text x="32" y="40" font-family="Georgia,serif" font-size="22" font-weight="bold"
        text-anchor="middle" fill="${s.ink}">${s.label}</text>
`,
  )
}

// -------------------------------------------------------------------- armi

/** Icone armi: linea spessa su fondo trasparente, stile inciso. */
const WEAPONS = {
  candlestick: `
  <path d="M 32 54 h 24 M 44 54 V 30" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M 36 30 h 16 v 5 h -16 z" fill="currentColor"/>
  <path d="M 44 28 C 38 22 44 16 44 10 C 44 16 50 22 44 28 Z" fill="currentColor"/>
  <ellipse cx="44" cy="56" rx="16" ry="4" fill="currentColor" opacity="0.75"/>`,

  dagger: `
  <path d="M 44 6 L 52 26 L 44 46 L 36 26 Z" fill="currentColor"/>
  <rect x="28" y="46" width="32" height="6" rx="3" fill="currentColor"/>
  <rect x="41" y="52" width="6" height="16" rx="3" fill="currentColor"/>
  <circle cx="44" cy="70" r="5" fill="currentColor"/>`,

  lead_pipe: `
  <path d="M 16 46 C 16 26 30 16 48 16 L 68 16" stroke="currentColor" stroke-width="11"
        fill="none" stroke-linecap="round"/>
  <ellipse cx="68" cy="16" rx="4" ry="6" fill="currentColor" opacity="0.6"/>
  <path d="M 16 46 v 14" stroke="currentColor" stroke-width="11" stroke-linecap="round"/>`,

  revolver: `
  <path d="M 10 30 h 44 v 10 h -14 l -8 20 h -12 l 4 -20 h -14 z" fill="currentColor"/>
  <circle cx="34" cy="35" r="7" fill="${INK}" opacity="0.35"/>
  <path d="M 54 30 h 22 v 7 h -22 z" fill="currentColor"/>
  <path d="M 44 45 q 10 2 14 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>`,

  rope: `
  <path d="M 20 14 C 54 14 54 34 30 34 C 8 34 8 54 34 54 C 58 54 58 72 24 72"
        stroke="currentColor" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M 20 14 C 54 14 54 34 30 34 C 8 34 8 54 34 54 C 58 54 58 72 24 72"
        stroke="${INK}" stroke-width="2.5" fill="none" stroke-dasharray="5 7" opacity="0.45"/>`,

  wrench: `
  <path d="M 62 12 a 14 14 0 1 0 8 22 L 34 70 a 8 8 0 0 1 -12 -12 L 58 22 a 14 14 0 0 1 4 -10 z"
        fill="currentColor"/>
  <circle cx="26" cy="64" r="4" fill="${INK}" opacity="0.4"/>`,
}

const weaponIcon = (body) => svg(88, 88, `<g color="${PAPER}">${body}</g>`, ' fill="none"')

// ------------------------------------------------------------------ stanze

/** Pittogrammi delle stanze, disegnati per essere riconoscibili a 24px. */
const ROOMS = {
  kitchen: `<rect x="14" y="26" width="44" height="34" rx="4"/><circle cx="26" cy="20" r="5"/><circle cx="46" cy="20" r="5"/><rect x="22" y="34" width="28" height="18" rx="2" opacity="0.4"/>`,
  ballroom: `<circle cx="36" cy="22" r="10"/><path d="M 36 32 v 20 M 26 60 l 10 -8 l 10 8"/><path d="M 22 20 h -8 M 50 20 h 8" opacity="0.5"/>`,
  conservatory: `<path d="M 36 62 V 34"/><path d="M 36 34 C 20 34 14 20 20 12 C 30 12 36 22 36 34 Z"/><path d="M 36 40 C 52 40 58 26 52 18 C 42 18 36 28 36 40 Z"/>`,
  dining: `<rect x="12" y="34" width="48" height="6" rx="3"/><path d="M 20 40 v 18 M 52 40 v 18"/><circle cx="36" cy="24" r="6"/>`,
  billiard: `<rect x="10" y="24" width="52" height="30" rx="6"/><circle cx="26" cy="39" r="5" opacity="0.9"/><circle cx="44" cy="34" r="5" opacity="0.6"/><circle cx="50" cy="46" r="5" opacity="0.4"/>`,
  library: `<rect x="16" y="18" width="10" height="42" rx="2"/><rect x="30" y="24" width="10" height="36" rx="2"/><rect x="44" y="14" width="10" height="46" rx="2"/>`,
  lounge: `<path d="M 14 46 v -10 a 6 6 0 0 1 6 -6 h 32 a 6 6 0 0 1 6 6 v 10"/><rect x="10" y="44" width="52" height="14" rx="5"/><path d="M 18 58 v 6 M 54 58 v 6"/>`,
  hall: `<path d="M 20 62 V 22 l 16 -10 l 16 10 v 40"/><rect x="30" y="38" width="12" height="24" rx="2" opacity="0.5"/>`,
  study: `<rect x="12" y="30" width="48" height="8" rx="3"/><path d="M 18 38 v 20 M 54 38 v 20"/><path d="M 30 30 l 8 -18 l 8 18" opacity="0.7"/>`,
}

const roomIcon = (body) =>
  svg(
    72,
    72,
    `<g fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
  )

// ------------------------------------------------------------- carte e dorso

/** Dorso carta: motivo deco ripetuto, usato quando una carta e coperta. */
function cardBack() {
  return svg(
    160,
    224,
    `
  <defs>
    <pattern id="deco" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 20 10 L 10 20 L 0 10 Z" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.28"/>
    </pattern>
  </defs>
  <rect width="160" height="224" rx="12" fill="${INK}"/>
  <rect width="160" height="224" rx="12" fill="url(#deco)"/>
  ${decoFrame(160, 224, GOLD, 18, 2)}
  <circle cx="80" cy="112" r="34" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <path d="M 80 92 a 20 20 0 1 0 14 34 l 14 14" fill="none" stroke="${GOLD}"
        stroke-width="4" stroke-linecap="round"/>
`,
  )
}

/** Marchio del gioco, per la schermata iniziale e la lobby in TV. */
function logo() {
  return svg(
    420,
    140,
    `
  <rect width="420" height="140" rx="10" fill="none"/>
  ${decoFrame(420, 140, GOLD, 20, 2)}
  <text x="210" y="66" font-family="Georgia,serif" font-size="46" font-weight="bold"
        letter-spacing="10" text-anchor="middle" fill="${PAPER}">CLUEDO</text>
  <text x="210" y="96" font-family="Georgia,serif" font-size="15" letter-spacing="6"
        text-anchor="middle" fill="${GOLD}">TUDOR MANSION</text>
  <path d="M 90 110 h 240" stroke="${BLOOD}" stroke-width="2" opacity="0.8"/>
  <circle cx="210" cy="110" r="5" fill="${BLOOD}"/>
`,
  )
}

/** Favicon: lente d'ingrandimento su fondo scuro. */
function favicon() {
  return svg(
    64,
    64,
    `
  <rect width="64" height="64" rx="14" fill="${INK}"/>
  <circle cx="28" cy="28" r="14" fill="none" stroke="${GOLD}" stroke-width="5"/>
  <path d="M 38 38 L 52 52" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="28" cy="28" r="8" fill="${BLOOD}" opacity="0.35"/>
`,
  )
}

// ------------------------------------------------------------------ PNG PWA

/**
 * Encoder PNG minimale (RGBA, filtro 0) — serve solo per le icone PWA, che
 * iOS non accetta in SVG. Nessuna dipendenza: zlib e nel runtime di Node.
 */
function encodePng(width, height, rgba) {
  const crcTable = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })()

  const crc32 = (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([len, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // 10..12 restano a 0: deflate, filtro adattivo, nessun interlacciamento

  // Ogni riga e preceduta dal byte di filtro (0 = nessuno).
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

/** Disegna la lente d'ingrandimento pixel per pixel, con antialiasing. */
function pwaIcon(size) {
  const buf = Buffer.alloc(size * size * 4)
  const [bgR, bgG, bgB] = hexToRgb(INK)
  const [fgR, fgG, fgB] = hexToRgb(GOLD)
  const [acR, acG, acB] = hexToRgb(BLOOD)

  const cx = size * 0.44
  const cy = size * 0.44
  const ring = size * 0.24
  const thick = size * 0.075
  const handleW = size * 0.085

  const px = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4
    const inv = 1 - a
    buf[i] = Math.round(buf[i] * inv + r * a)
    buf[i + 1] = Math.round(buf[i + 1] * inv + g * a)
    buf[i + 2] = Math.round(buf[i + 2] * inv + b * a)
    buf[i + 3] = 255
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      buf[i] = bgR
      buf[i + 1] = bgG
      buf[i + 2] = bgB
      buf[i + 3] = 255
    }
  }

  // Alone rosso dentro la lente.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d < ring - thick / 2) px(x, y, acR, acG, acB, 0.3 * (1 - d / ring))
    }
  }

  // Manico: segmento spesso a 45 gradi.
  const hx0 = cx + ring * 0.72
  const hy0 = cy + ring * 0.72
  const hx1 = size * 0.83
  const hy1 = size * 0.83
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - hx0) * (hx1 - hx0) + (y - hy0) * (hy1 - hy0)) / ((hx1 - hx0) ** 2 + (hy1 - hy0) ** 2),
        ),
      )
      const d = Math.hypot(x - (hx0 + t * (hx1 - hx0)), y - (hy0 + t * (hy1 - hy0)))
      const a = Math.max(0, Math.min(1, handleW / 2 + 0.5 - d))
      if (a > 0) px(x, y, fgR, fgG, fgB, a)
    }
  }

  // Anello della lente.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const a = Math.max(0, Math.min(1, thick / 2 + 0.5 - Math.abs(d - ring)))
      if (a > 0) px(x, y, fgR, fgG, fgB, a)
    }
  }

  return encodePng(size, size, buf)
}

// ------------------------------------------------------------------- output

mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'suspects'), { recursive: true })
mkdirSync(join(OUT, 'tokens'), { recursive: true })
mkdirSync(join(OUT, 'weapons'), { recursive: true })
mkdirSync(join(OUT, 'rooms'), { recursive: true })

const made = []
for (const s of SUSPECTS) {
  made.push(write(join('suspects', `${s.id}.svg`), suspectPortrait(s)))
  made.push(write(join('tokens', `${s.id}.svg`), suspectToken(s)))
}
for (const [id, body] of Object.entries(WEAPONS)) {
  made.push(write(join('weapons', `${id}.svg`), weaponIcon(body)))
}
for (const [id, body] of Object.entries(ROOMS)) {
  made.push(write(join('rooms', `${id}.svg`), roomIcon(body)))
}
made.push(write('card-back.svg', cardBack()))
made.push(write('logo.svg', logo()))
made.push(write('pwa-192.png', pwaIcon(192)))
made.push(write('pwa-512.png', pwaIcon(512)))

writeFileSync(join(ROOT, 'public', 'favicon.svg'), favicon())

console.log(`Generati ${made.length + 1} asset in public/assets`)
for (const name of made) console.log('  ', name.replace(/\\/g, '/'))
