import type { ParsedStanding } from './types'

function parseStat(stats: { name: string; value: string }[], key: string): number {
  const found = stats.find(s => s.name === key)
  return found ? parseInt(found.value, 10) || 0 : 0
}

function getZone(statuses?: { type: string }[]): 'up' | 'playoff' | 'down' | '' {
  if (!statuses?.length) return ''
  for (const s of statuses) {
    const t = s.type?.toLowerCase() || ''
    if (t === 'advancement' || t === 'promotion') return 'up'
    if (t === 'playoff' || t === 'qualification') return 'playoff'
    if (t === 'relegation' || t === 'demotion') return 'down'
  }
  return ''
}

export function parseStandings(sdData: any): ParsedStanding[] {
  const groups = sdData?.groups || []
  const parsed: ParsedStanding[] = []
  for (const group of groups) {
    for (const entry of (group.standings || [])) {
      const stats: { name: string; value: string }[] = entry.stats || []
      parsed.push({
        position: entry.position || 0,
        team: entry.team || { id: 0, name: '—' },
        gp: parseStat(stats, 'gp'), w: parseStat(stats, 'w'),
        d: parseStat(stats, 'd'), l: parseStat(stats, 'l'),
        gf: parseStat(stats, 'gf'), ga: parseStat(stats, 'ga'),
        gd: parseStat(stats, 'gd'), pts: parseStat(stats, 'pts'),
        zone: getZone(entry.positionStatuses)
      })
    }
  }
  parsed.sort((a, b) => a.position - b.position)
  return parsed
}
