/**
 * Team Arena Index Builder
 *
 * Pre-computes a normalized team name → arena location index for O(1) lookups
 * in /api/nearby at runtime, replacing the costly fuzzy findArenaLocation().
 *
 * Usage:
 *   npx tsx scripts/build-team-index.ts
 *
 * Output: data/teamArenaIndex.json
 * Run alongside update-arenas.ts whenever arenas.json changes.
 */

import * as fs from 'fs'
import * as path from 'path'

const ARENAS_PATH = path.join(__dirname, '..', 'data', 'arenas.json')
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'teamArenaIndex.json')

type ArenaEntry = { lat: number; lng: number; city: string; arena?: string }

function stripDiacritics(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function main() {
  const arenaMap: Record<string, ArenaEntry> = JSON.parse(fs.readFileSync(ARENAS_PATH, 'utf8'))

  // Build index: for each key, store both the original lowercase and the diacritics-stripped version
  // This allows O(1) lookup at runtime for exact matches
  const index: Record<string, ArenaEntry> = {}

  for (const [key, val] of Object.entries(arenaMap)) {
    const lower = key.toLowerCase()
    index[lower] = val

    const norm = stripDiacritics(key)
    if (norm !== lower && !index[norm]) {
      index[norm] = val
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2))
  console.log(`Built team index: ${Object.keys(index).length} entries (from ${Object.keys(arenaMap).length} arenas)`)
  console.log(`Written to ${OUTPUT_PATH}`)
}

main()
