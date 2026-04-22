import type { ApiFootballEvent, ApiFootballLineup } from './types'
import { getApiFootballLeagueId, getApiFootballTeamId } from './apifootballMapping'

const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 60 min for finished matches

async function apiFB(endpoint: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const url = `/api/apifootball/${endpoint}${qs ? '?' + qs : ''}`

  const cached = cache.get(url)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  cache.set(url, { data, ts: Date.now() })
  return data
}

// Cache for fixture ID lookups: "leagueId-season-date" → fixture list
const fixtureCache = new Map<string, any[]>()

export async function findFixtureId(
  leagueName: string,
  homeTeamName: string,
  awayTeamName: string,
  matchDate: string // ISO date string e.g. "2024-10-21T12:00:00+00:00"
): Promise<number | null> {
  const leagueId = getApiFootballLeagueId(leagueName)
  if (!leagueId) return null

  const homeId = getApiFootballTeamId(homeTeamName)
  const awayId = getApiFootballTeamId(awayTeamName)
  if (!homeId || !awayId) return null

  const date = matchDate.slice(0, 10) // "2024-10-21"
  const year = parseInt(date.slice(0, 4))
  if (year < 2022 || year > 2024) return null

  const cacheKey = `${leagueId}-${year}-${date}`
  let fixtures = fixtureCache.get(cacheKey)

  if (!fixtures) {
    const data = await apiFB('fixtures', {
      league: leagueId,
      season: year,
      from: date,
      to: date,
    })
    const list: any[] = data?.response || []
    fixtureCache.set(cacheKey, list)
    fixtures = list
  }

  // Match by team IDs
  const match = fixtures.find((f: any) =>
    f.teams?.home?.id === homeId && f.teams?.away?.id === awayId
  )
  return match?.fixture?.id ?? null
}

export async function fetchFixtureEvents(fixtureId: number): Promise<ApiFootballEvent[]> {
  const data = await apiFB('fixtures/events', { fixture: fixtureId })
  return data?.response || []
}

export async function fetchFixtureLineups(fixtureId: number): Promise<ApiFootballLineup[]> {
  const data = await apiFB('fixtures/lineups', { fixture: fixtureId })
  return data?.response || []
}

export async function fetchMatchDetails(
  leagueName: string,
  homeTeamName: string,
  awayTeamName: string,
  matchDate: string
): Promise<{ events: ApiFootballEvent[]; lineups: ApiFootballLineup[] } | null> {
  const fixtureId = await findFixtureId(leagueName, homeTeamName, awayTeamName, matchDate)
  if (!fixtureId) return null

  const [events, lineups] = await Promise.all([
    fetchFixtureEvents(fixtureId),
    fetchFixtureLineups(fixtureId),
  ])
  return { events, lineups }
}
