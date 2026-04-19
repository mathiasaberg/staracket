const STORAGE_KEY_LEAGUES = 'staracket_fav_leagues'
const STORAGE_KEY_TEAMS = 'staracket_fav_teams'

function read(key: string): number[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function write(key: string, ids: number[]) {
  localStorage.setItem(key, JSON.stringify(ids))
}

export function getFavLeagues(): number[] { return read(STORAGE_KEY_LEAGUES) }
export function getFavTeams(): number[] { return read(STORAGE_KEY_TEAMS) }

export function toggleFavLeague(id: number): number[] {
  const cur = getFavLeagues()
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
  write(STORAGE_KEY_LEAGUES, next)
  return next
}
export function toggleFavTeam(id: number): number[] {
  const cur = getFavTeams()
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
  write(STORAGE_KEY_TEAMS, next)
  return next
}
