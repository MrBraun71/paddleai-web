import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'tts')

const TEXTS = [
  "Riduci l'oscillazione del busto",
  'Buona rotazione',
  'Asimmetria rilevata',
  'Stai perdendo ampiezza',
  'Migliora la fluidità del movimento',
  'Estendi di più il braccio avanti',
  'Eccellente! SQI sopra 85',
  'Mantieni la testa più ferma',
  'Non tirare subito di braccia: parte con la spinta delle gambe',
  'Nella ripresa pieghi le gambe troppo presto: prima le mani oltre le ginocchia',
  'Ginocchia troppo aperte in compressione: tieni le rotule allineate e scendi tra le gambe',
  'Traiettoria del manubrio ondulata: mantieni le mani in linea retta, senza saltare le ginocchia',
  'Oscilli a destra e a sinistra durante la passata: mantieni il busto stabile sulla linea mediana',
  'Effettua lo svincolo: premi le mani verso il basso per estrarre le pale',
  'Ripresa troppo rapida: fai scorrere il carrello in modo lento e controllato',
  "Inclina di più la pala all'attacco",
  'La voce è attiva',
]

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

mkdirSync(OUT, { recursive: true })

for (const text of TEXTS) {
  const name = `tts/${fnv1a(text)}.mp3`
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=it&q=${encodeURIComponent(text)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) {
    console.error(`FAIL ${res.status} -> ${name} | ${text}`)
    continue
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(__dirname, '..', 'public', name), buf)
  console.log(`OK ${buf.length}B -> ${name} | ${text}`)
}