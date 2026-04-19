export const API = (path: string, params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  return fetch(`/api/everysport/${path}${qs ? '?' + qs : ''}`).then(r => r.json())
}
