/**
 * Arena Location Updater
 *
 * Fetches all leagues and teams from Everysport, extracts arena/city info,
 * merges with existing arenas.json coordinates, and optionally geocodes
 * unknown cities via Nominatim (OpenStreetMap).
 *
 * Usage:
 *   EVERYSPORT_API_KEY=xxx node --require ts-node/register scripts/update-arenas.ts
 *   # or with tsx:
 *   EVERYSPORT_API_KEY=xxx npx tsx scripts/update-arenas.ts
 *
 * Run monthly or when new teams/leagues are added.
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

type ArenaEntry = { lat: number; lng: number; city: string }

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`)
  return res.json()
}

// Rate-limited Nominatim geocoding (1 req/sec as per usage policy)
async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(city + ', Sweden')}&format=json&limit=1`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'staracket-arena-updater/1.0' }
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch {}
  return null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  // Load existing arenas
  let existing: Record<string, ArenaEntry> = {}
  if (fs.existsSync(ARENAS_PATH)) {
    existing = JSON.parse(fs.readFileSync(ARENAS_PATH, 'utf8'))
    console.log(`Loaded ${Object.keys(existing).length} existing arena entries`)
  }

  // Fetch all football leagues
  console.log('Fetching leagues...')
  const leaguesData = await fetchJSON(`${BASE}/leagues?sport=10&limit=500&apikey=${API_KEY}`)
  const leagues: { id: number; name: string }[] = leaguesData.leagues || []
  console.log(`Found ${leagues.length} leagues`)

  // Collect team names and cities from events
  const teamCities = new Map<string, string>() // lowercase team name -> city
  const BATCH = 15
  let processed = 0

  for (let i = 0; i < leagues.length; i += BATCH) {
    const batch = leagues.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (league) => {
        const url = `${BASE}/leagues/${league.id}/events?limit=10&apikey=${API_KEY}`
        const data = await fetchJSON(url)
        for (const event of (data.events || [])) {
          for (const team of [event.homeTeam, event.visitingTeam]) {
            if (team?.name && team?.arena?.city) {
              teamCities.set(team.name.toLowerCase(), team.arena.city)
            }
          }
        }
      })
    )
    processed += batch.length
    process.stdout.write(`\r  Scanned ${processed}/${leagues.length} leagues`)
  }
  console.log(`\nFound ${teamCities.size} teams with arena city info from API`)

  // Merge: add new teams that aren't in existing arenas
  let newCount = 0
  let geocodedCount = 0
  const toGeocode: { key: string; city: string }[] = []

  for (const [teamKey, city] of teamCities) {
    if (existing[teamKey]) continue // already have coordinates

    // Check if city is already known from another team
    const cityLower = city.toLowerCase()
    const existingWithSameCity = Object.values(existing).find(
      e => e.city.toLowerCase() === cityLower
    )
    if (existingWithSameCity) {
      existing[teamKey] = { ...existingWithSameCity, city }
      newCount++
    } else {
      toGeocode.push({ key: teamKey, city })
    }
  }

  // Geocode unknown cities via Nominatim (rate limited: 1/sec)
  if (toGeocode.length > 0) {
    console.log(`\nGeocoding ${toGeocode.length} new cities...`)
    for (const { key, city } of toGeocode) {
      const coords = await geocodeCity(city)
      if (coords) {
        existing[key] = { lat: coords.lat, lng: coords.lng, city }
        geocodedCount++
        console.log(`  ✓ ${key} → ${city} (${coords.lat}, ${coords.lng})`)
      } else {
        console.log(`  ✗ ${key} → ${city} (geocoding failed)`)
      }
      await sleep(1100) // Nominatim rate limit
    }
  }

  // Sort keys alphabetically and write
  const sorted: Record<string, ArenaEntry> = {}
  for (const key of Object.keys(existing).sort()) {
    sorted[key] = existing[key]
  }

  fs.mkdirSync(path.dirname(ARENAS_PATH), { recursive: true })
  fs.writeFileSync(ARENAS_PATH, JSON.stringify(sorted, null, 2))

  console.log(`\nDone!`)
  console.log(`  Total entries: ${Object.keys(sorted).length}`)
  console.log(`  New from city match: ${newCount}`)
  console.log(`  New from geocoding: ${geocodedCount}`)
  console.log(`  Written to: ${ARENAS_PATH}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
