import type { ApiFootballEvent, ApiFootballLineup } from './types'
import { getApiFootballLeagueId, getApiFootballTeamId } from './apifootballMapping'

const CACHE_MAX = 100
const CACHE_TTL = 60 * 60 * 1000 // 60 min for finished matches

const cache = new Map<string, { data: any; ts: number }>()
const inflight = new Map<string, Promise<any>>()

function evictOldest() {
  if (cache.size <= CACHE_MAX) return
  let oldestKey: string | null = null
  let oldestTs = Infinity
  cache.forEach((entry, key) => {
    if (entry.ts < oldestTs) { oldestTs = entry.ts; oldestKey = key }
  })
  if (oldestKey) cache.delete(oldestKey)
}

async function apiFB(endpoint: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const url = `/api/apifootball/${endpoint}${qs ? '?' + qs : ''}`

  const cached = cache.get(url)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const pending = inflight.get(url)
  if (pending) return pending

  const request = fetch(url).then(async res => {
    if (!res.ok) { inflight.delete(url); return null }
    const data = await res.json()
    cache.set(url, { data, ts: Date.now() })
    evictOldest()
    inflight.delete(url)
    return data
  }).catch(err => {
    inflight.delete(url)
    throw err
  })

  inflight.set(url, request)
  return request
}

// Cache for fixture ID lookups: "leagueId-season-date" → fixture list
const FIXTURE_CACHE_MAX = 200
const FIXTURE_CACHE_TTL = 60 * 60 * 1000
const fixtureCache = new Map<string, { data: any[]; ts: number }>()

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
  const cachedFixture = fixtureCache.get(cacheKey)
  let fixtures: any[]

  if (cachedFixture && Date.now() - cachedFixture.ts < FIXTURE_CACHE_TTL) {
    fixtures = cachedFixture.data
  } else {
    const data = await apiFB('fixtures', {
      league: leagueId,
      season: year,
      from: date,
      to: date,
    })
    const list: any[] = data?.response || []
    fixtureCache.set(cacheKey, { data: list, ts: Date.now() })
    if (fixtureCache.size > FIXTURE_CACHE_MAX) {
      const oldest = fixtureCache.keys().next().value
      if (oldest) fixtureCache.delete(oldest)
    }
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
