const apiCache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 min

export const API = async (path: string, params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const url = `/api/everysport/${path}${qs ? '?' + qs : ''}`

  const cached = apiCache.get(url)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const data = await fetch(url).then(r => r.json())
  apiCache.set(url, { data, ts: Date.now() })
  return data
}
