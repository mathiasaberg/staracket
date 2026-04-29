import type { League } from './types'

export const REGION_ORDER = [
  'Favoriter', 'Nationellt',
  'Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5', 'Division 6', 'Division 7',
  'Ungdomslag', 'Övrigt', 'Internationellt'
]

function isYouth(name: string): boolean {
  return /\b[PF]\d{2}\b/i.test(name) || /\bU\d+\b/i.test(name)
}

function isNationalYouth(name: string): boolean {
  if (!isYouth(name)) return false
  return /allsvenskan|superettan|elitettan|riksserie|nationell/i.test(name)
}

function getDivisionNumber(name: string): number {
  const m = name.match(/\bdivision\s+(\d+)\b/i)
  return m ? parseInt(m[1], 10) : 0
}

export function getRegion(name: string): string {
  if (/premier league|la liga|bundesliga|serie a|ligue 1|champions|europa league|eredivisie/i.test(name)) return 'Internationellt'

  // National youth leagues → Nationellt
  if (isNationalYouth(name)) return 'Nationellt'

  // National senior leagues
  if (/allsvenskan|superettan|damallsvenskan|elitettan|svenska cupen|\bettan\b/i.test(name) && !isYouth(name)) return 'Nationellt'

  // Non-national youth leagues → Ungdomslag
  if (isYouth(name)) return 'Ungdomslag'

  // Division N (senior)
  const div = getDivisionNumber(name)
  if (div > 0 && div <= 7) return `Division ${div}`

  if (/division\s+\d/i.test(name)) return 'Övrigt'
  return 'Övrigt'
}

export function isSwedish(name: string): boolean {
  return getRegion(name) !== 'Internationellt'
}

export function groupLeagues(leagueList: League[], favIds?: number[]): { region: string; leagues: League[] }[] {
  const map = new Map<string, League[]>()
  for (const r of REGION_ORDER) map.set(r, [])
  for (const l of leagueList) {
    if (favIds?.length && favIds.includes(l.id)) {
      map.get('Favoriter')!.push(l)
    }
    const r = getRegion(l.name)
    if (!map.has(r)) map.set(r, [])
    map.get(r)!.push(l)
  }
  // Sort Ungdomslag by division number, then alphabetically
  const youth = map.get('Ungdomslag')
  if (youth) {
    youth.sort((a, b) => {
      const da = getDivisionNumber(a.name)
      const db = getDivisionNumber(b.name)
      if (da !== db) return da - db
      return a.name.localeCompare(b.name, 'sv')
    })
  }
  return REGION_ORDER.map(r => ({ region: r, leagues: map.get(r)! })).filter(g => g.leagues.length > 0)
}
