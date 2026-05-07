/**
 * League Bounds Builder
 *
 * Computes geographic centroid and radius for each league based on
 * the locations of its teams (from arenas.json). Used by /api/nearby
 * to geo-filter leagues before fetching events (skip distant leagues).
 *
 * Usage:
 *   EVERYSPORT_API_KEY=xxx npx tsx scripts/update-league-bounds.ts
 *
 * Run once per season start or when new leagues are added.
 * Output: data/leagueBounds.json
 */

import * as fs from 'fs'
import * as path from 'path'

const API_KEY = process.env.EVERYSPORT_API_KEY
if (!API_KEY) {
  console.error('Error: EVERYSPORT_API_KEY environment variable is required')
  process.exit(1)
}

const BASE = 'https://api.everysport.com/v1'
const ARENAS_PATH = path.join(__dirname, '..', 'data', 'arenas.json')
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'leagueBounds.json')

type ArenaEntry = { lat: number; lng: number; city: string; arena?: string }

// Load arenas for team lookups
const arenaMap: Record<string, ArenaEntry> = JSON.parse(fs.readFileSync(ARENAS_PATH, 'utf8'))

function stripDiacritics(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function findArenaLocation(teamName: string): ArenaEntry | null {
  const lower = teamName.toLowerCase()
  if (arenaMap[lower]) return arenaMap[lower]
  for (const [key, val] of Object.entries(arenaMap)) {
    if (lower.includes(key) || key.includes(lower)) return val
  }
  const norm = stripDiacritics(teamName)
  for (const [key, val] of Object.entries(arenaMap)) {
    const normKey = stripDiacritics(key)
    if (norm.includes(normKey) || normKey.includes(norm)) return val
  }
  return null
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isNationalLeague(name: string): boolean {
  return /allsvenskan|superettan|damallsvenskan|elitettan|svenska cupen|\bettan\b/i.test(name)
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`)
  return res.json()
}

type LeagueBound = {
  lat: number
  lng: number
  radiusKm: number
  teamCount: number
  name: string
}

async function main() {
  console.log('Fetching all football leagues...')
  const leaguesData = await fetchJSON(`${BASE}/leagues?sport=10&limit=500&apikey=${API_KEY}`)
  const leagues: { id: number; name: string }[] = leaguesData.leagues || []
  console.log(`Found ${leagues.length} leagues`)

  const bounds: Record<string, LeagueBound> = {}
  const BATCH = 15
  let processed = 0
  let skippedNoTeams = 0

  for (let i = 0; i < leagues.length; i += BATCH) {
    const batch = leagues.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (league) => {
        // National leagues → nationwide, no filtering needed
        if (isNationalLeague(league.name)) {
          bounds[String(league.id)] = {
            lat: 62.0, // center of Sweden
            lng: 15.0,
            radiusKm: 9999,
            teamCount: 0,
            name: league.name,
          }
          return
        }

        // Fetch a few events to discover team names
        const url = `${BASE}/leagues/${league.id}/events?limit=50&apikey=${API_KEY}`
        try {
          const data = await fetchJSON(url)
          const events = data.events || []

          // Collect unique team names
          const teamNames = new Set<string>()
          for (const event of events) {
            if (event.homeTeam?.name) teamNames.add(event.homeTeam.name)
            if (event.visitingTeam?.name) teamNames.add(event.visitingTeam.name)
          }

          // Look up coordinates for each team
          const locations: { lat: number; lng: number }[] = []
          for (const name of teamNames) {
            const loc = findArenaLocation(name)
            if (loc) locations.push({ lat: loc.lat, lng: loc.lng })
          }

          if (locations.length < 2) {
            // Not enough data to compute bounds — mark as nationwide
            bounds[String(league.id)] = {
              lat: 62.0,
              lng: 15.0,
              radiusKm: 9999,
              teamCount: locations.length,
              name: league.name,
            }
            skippedNoTeams++
            return
          }

          // Compute centroid
          const centroidLat = locations.reduce((s, l) => s + l.lat, 0) / locations.length
          const centroidLng = locations.reduce((s, l) => s + l.lng, 0) / locations.length

          // Compute max distance from centroid to any team
          let maxDist = 0
          for (const loc of locations) {
            const d = haversineKm(centroidLat, centroidLng, loc.lat, loc.lng)
            if (d > maxDist) maxDist = d
          }

          bounds[String(league.id)] = {
            lat: Math.round(centroidLat * 1000) / 1000,
            lng: Math.round(centroidLng * 1000) / 1000,
            radiusKm: Math.round(maxDist),
            teamCount: locations.length,
            name: league.name,
          }
        } catch {
          // If fetch fails, mark as nationwide (don't filter it out)
          bounds[String(league.id)] = {
            lat: 62.0,
            lng: 15.0,
            radiusKm: 9999,
            teamCount: 0,
            name: league.name,
          }
        }
      })
    )
    processed += batch.length
    process.stdout.write(`\r  Processed ${processed}/${leagues.length} leagues`)
  }

  console.log(`\n\nResults:`)
  console.log(`  Total leagues: ${Object.keys(bounds).length}`)
  console.log(`  With geo-bounds: ${Object.values(bounds).filter(b => b.radiusKm < 9999).length}`)
  console.log(`  Nationwide (national/unknown): ${Object.values(bounds).filter(b => b.radiusKm >= 9999).length}`)
  console.log(`  Skipped (no team data): ${skippedNoTeams}`)

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(bounds, null, 2))
  console.log(`\nWritten to ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
