// Gera icon-192.png e icon-512.png a partir do icon.svg via sharp.
// Fallback: PNG mínimo codificado em base64 (1x1 teal pixel) se sharp falhar.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(__dirname, '..', 'public')
const SVG = join(PUBLIC, 'icon.svg')

const FALLBACK_TEAL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkqAcAAIUAgUW0RjgAAAAASUVORK5CYII='

async function generate() {
  if (!existsSync(SVG)) {
    console.error('[gen-icons] icon.svg missing — using fallback')
    writeFallback()
    return
  }
  try {
    const sharp = (await import('sharp')).default
    const svgBuffer = readFileSync(SVG)
    await sharp(svgBuffer).resize(192, 192).png().toFile(join(PUBLIC, 'icon-192.png'))
    await sharp(svgBuffer).resize(512, 512).png().toFile(join(PUBLIC, 'icon-512.png'))
    console.log('[gen-icons] generated icon-192.png + icon-512.png via sharp')
  } catch (err) {
    console.warn('[gen-icons] sharp failed:', err.message, '— using fallback PNG')
    writeFallback()
  }
}

function writeFallback() {
  const buf = Buffer.from(FALLBACK_TEAL_PNG_B64, 'base64')
  writeFileSync(join(PUBLIC, 'icon-192.png'), buf)
  writeFileSync(join(PUBLIC, 'icon-512.png'), buf)
}

generate()
