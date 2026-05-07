import type { NextApiRequest, NextApiResponse } from 'next'

// Server-side arena locations — loaded once per cold start
import arenas from '../../data/arenas.json'
import leagueBoundsData from '../../data/leagueBounds.json'
import teamIndexData from '../../data/teamArenaIndex.json'

type ArenaEntry = { lat: number; lng: number; city: string; arena?: string }
const arenaMap: Record<string, ArenaEntry> = arenas as Record<string, ArenaEntry>

type LeagueBound = { lat: number; lng: number; radiusKm: number; teamCount: number; name: string }
const leagueBounds: Record<string, LeagueBound> = leagueBoundsData as Record<string, LeagueBound>

// Pre-computed normalized team name → arena for O(1) lookups
const teamIndex: Record<string, ArenaEntry> = teamIndexData as Record<string, ArenaEntry>

// In-memory cache for aggregated today-events (shared across requests on same instance)
let eventsCache: { date: string; ts: number; events: any[] } | null = null
const EVENTS_CACHE_TTL = 30 * 60 * 1000 // 30 min — match schedules rarely change intra-day

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

function stripDiacritics(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function findArenaLocation(teamName: string): ArenaEntry | null {
  const lower = teamName.toLowerCase()

  // Fast path: O(1) lookup in pre-computed index
  const hasIndex = Object.keys(teamIndex).length > 0
  if (hasIndex) {
    if (teamIndex[lower]) return teamIndex[lower]
    const norm = stripDiacritics(teamName)
    if (teamIndex[norm]) return teamIndex[norm]
  }

  // Fallback: original fuzzy search (for teams not yet in the index)
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

async function fetchAllTodayEvents(date: string, userLat?: number, userLng?: number): Promise<any[]> {
  // Return cached if fresh
  if (eventsCache && eventsCache.date === date && Date.now() - eventsCache.ts < EVENTS_CACHE_TTL) {
    return eventsCache.events
  }

  const apikey = process.env.EVERYSPORT_API_KEY || ''

  // First: fetch all leagues for current season
  const leaguesRes = await fetch(
    `https://api.everysport.com/v1/leagues?sport=10&limit=500&apikey=${apikey}`
  )
  if (!leaguesRes.ok) throw new Error(`Leagues fetch failed: ${leaguesRes.status}`)
  const leaguesData = await leaguesRes.json()
  let leagues: { id: number; name: string }[] = leaguesData.leagues || []

  // Geo-filter: skip leagues whose geographic area is too far from the user
  // Only applies if we have league bounds data AND user coordinates
  const hasLeagueBounds = Object.keys(leagueBounds).length > 0
  if (hasLeagueBounds && userLat !== undefined && userLng !== undefined) {
    const GEO_BUFFER_KM = 150 // Include leagues within 150km of their outer boundary
    const before = leagues.length
    leagues = leagues.filter(league => {
      const bound = leagueBounds[String(league.id)]
      if (!bound || bound.radiusKm >= 9999) return true // National/unknown → always include
      const dist = haversineKm(userLat, userLng, bound.lat, bound.lng)
      return dist <= bound.radiusKm + GEO_BUFFER_KM
    })
    console.log(`[nearby] Geo-filter: ${before} → ${leagues.length} leagues (user at ${userLat.toFixed(2)}, ${userLng.toFixed(2)})`)
  }

  // Fetch events for all leagues in parallel (server-side, no browser overhead)
  const BATCH = 50
  const allEvents: any[] = []

  for (let i = 0; i < leagues.length; i += BATCH) {
    const batch = leagues.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (league) => {
        const url = `https://api.everysport.com/v1/leagues/${league.id}/events?from=${date}&to=${date}&limit=100&apikey=${apikey}`
        const res = await fetch(url)
        if (!res.ok) return []
        const data = await res.json()
        return (data.events || [])
          .filter((e: any) => e.startDate && e.startDate.startsWith(date))
          .map((e: any) => ({ ...e, _leagueId: league.id, _leagueName: league.name }))
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') allEvents.push(...r.value)
    }
  }

  eventsCache = { date, ts: Date.now(), events: allEvents }
  return allEvents
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { lat, lng, radius, date } = req.query

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' })
  }

  const rawLat = parseFloat(lat as string)
  const rawLng = parseFloat(lng as string)
  const maxKm = parseFloat((radius as string) || '100')
  const queryDate = (date as string) || new Date().toISOString().slice(0, 10)

  if (isNaN(rawLat) || isNaN(rawLng) || rawLat < -90 || rawLat > 90 || rawLng < -180 || rawLng > 180) {
    return res.status(400).json({ error: 'Invalid lat/lng values' })
  }

  // Quantize coordinates to ~1km grid so nearby users share the same CDN cache entry
  const userLat = Math.round(rawLat * 100) / 100
  const userLng = Math.round(rawLng * 100) / 100

  try {
    const events = await fetchAllTodayEvents(queryDate, userLat, userLng)

    const nearby: any[] = []
    const unmatchedTeams: string[] = []

    for (const event of events) {
      const homeName = event.homeTeam?.name
      if (!homeName) continue

      const loc = findArenaLocation(homeName)
      if (!loc) {
        if (!unmatchedTeams.includes(homeName)) unmatchedTeams.push(homeName)
        continue
      }

      const dist = haversineKm(userLat, userLng, loc.lat, loc.lng)
      const venueName = event.facts?.arena?.name || event.homeTeam?.arena?.name || null

      if (dist <= maxKm) {
        nearby.push({
          event,
          leagueId: event._leagueId,
          leagueName: event._leagueName,
          distance: Math.round(dist * 10) / 10,
          venueCity: loc.city,
          venueName,
        })
      }
    }

    nearby.sort((a, b) => a.distance - b.distance)

    // Find the closest known venue to the user from ALL arenas (regardless of today's matches)
    let closestVenue: { name: string | null; city: string; distance: number } | null = null
    for (const [, entry] of Object.entries(arenaMap)) {
      const d = haversineKm(userLat, userLng, entry.lat, entry.lng)
      if (!closestVenue || d < closestVenue.distance) {
        closestVenue = { name: entry.arena || null, city: entry.city, distance: Math.round(d * 10) / 10 }
      }
    }

    // Cache aggressively — quantized coordinates ensure nearby users share the same CDN entry
    // 15 min fresh, 30 min stale-while-revalidate (match schedules rarely change intra-day)
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800')
    res.json({
      matches: nearby,
      closestVenue,
      meta: {
        totalEvents: events.length,
        unmatchedTeams: unmatchedTeams.slice(0, 20),
        date: queryDate,
      }
    })
  } catch (e: any) {
    console.error('[nearby] Error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
