const CACHE_MAX = 200
const DEFAULT_TTL = 5 * 60 * 1000 // 5 min

export const TTL = {
  SHORT: 2 * 60 * 1000,    // 2 min — ongoing matches
  DEFAULT: 5 * 60 * 1000,  // 5 min — standings, events
  MEDIUM: 30 * 60 * 1000,  // 30 min — league metadata
  LONG: 60 * 60 * 1000,    // 60 min — finished matches, historical data
}

const apiCache = new Map<string, { data: any; ts: number; ttl: number }>()
const inflight = new Map<string, Promise<any>>()

function evictOldest() {
  if (apiCache.size <= CACHE_MAX) return
  let oldestKey: string | null = null
  let oldestTs = Infinity
  apiCache.forEach((entry, key) => {
    if (entry.ts < oldestTs) { oldestTs = entry.ts; oldestKey = key }
  })
  if (oldestKey) apiCache.delete(oldestKey)
}

export const API = async (path: string, params: Record<string, string | number> = {}, ttl = DEFAULT_TTL) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const url = `/api/everysport/${path}${qs ? '?' + qs : ''}`

  const cached = apiCache.get(url)
  if (cached && Date.now() - cached.ts < cached.ttl) return cached.data

  const pending = inflight.get(url)
  if (pending) return pending

  const request = fetch(url).then(r => r.json()).then(data => {
    apiCache.set(url, { data, ts: Date.now(), ttl })
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
