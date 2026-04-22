import type { League } from './types'

export const REGION_ORDER = [
  'Favoriter', 'Nationellt', 'Division 1', 'Norrland',
  'Svealand & Stockholm', 'Götaland', 'Övrigt', 'Internationellt'
]

export function getRegion(name: string): string {
  if (/premier league|la liga|bundesliga|serie a|ligue 1|champions|europa league|eredivisie/i.test(name)) return 'Internationellt'
  if (/division 1,\s*herrar/i.test(name)) return 'Övrigt'
  if (/allsvenskan|superettan|damallsvenskan|elitettan|svenska cupen|ettan/i.test(name)) return 'Nationellt'
  if (/division 1\b/i.test(name)) return 'Division 1'
  if (/norrland|norrbotten|västerbotten|jämtland|ångermanland|medelpad|hälsingland|gästrikland|gestrikland|lappland|härjedalen|gävle|sandviken|sundsvall|timrå|umeå|skellefteå|luleå|boden|piteå|kiruna|gällivare|östersund|örnsköldsvik|härnösand|kramfors|hudiksvall|bollnäs|söderhamn/i.test(name)) return 'Norrland'
  if (/dalarna|västmanland|uppland|södermanland|örebro|värmland|stockholm|svealand|bergslagen|närke|roslagen|solna|södertälje|täby|nacka|sollentuna|huddinge|haninge|norrtälje|västerås|eskilstuna|nyköping|katrineholm|strängnäs|karlstad|karlskoga|falun|borlänge|mora|enköping/i.test(name)) return 'Svealand & Stockholm'
  if (/göteborg|västra götaland|västergötland|östergötland|småland|halland|blekinge|skåne|gotland|bohuslän|götaland|jönköping|kalmar|kronoberg|dalsland|sjuhärad|malmö|lund|helsingborg|landskrona|trelleborg|kristianstad|hässleholm|ängelholm|ystad|eslöv|borås|trollhättan|skövde|lidköping|mariestad|uddevalla|halmstad|varberg|falkenberg|kungsbacka|norrköping|linköping|motala|värnamo|nässjö|oskarshamn|västervik|växjö|karlskrona|visby/i.test(name)) return 'Götaland'
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
    map.get(r)!.push(l)
  }
  return REGION_ORDER.map(r => ({ region: r, leagues: map.get(r)! })).filter(g => g.leagues.length > 0)
}
