// Everysport league name → API-Football league ID
const LEAGUE_MAP: Record<string, number> = {
  'Allsvenskan': 113,
  'Superettan': 114,
  'Damallsvenskan': 549,
  'Elitettan': 736,
  'Ettan Norra': 563,
  'Ettan Södra': 564,
  'Svenska Cupen': 115,
  'Svenska Cupen Women': 737,
}

// Normalized team name → API-Football team ID
// Names normalized: lowercase, stripped diacritics, trimmed
const TEAM_MAP: Record<string, number> = {
  'aik': 377,
  'hammarby': 363,
  'djurgardens if': 364,
  'djurgarden': 364,
  'malmo ff': 375,
  'ifk goteborg': 366,
  'if elfsborg': 372,
  'elfsborg': 372,
  'bk hacken': 367,
  'hacken': 367,
  'sirius': 370,
  'ik sirius': 370,
  'ifk norrkoping': 378,
  'norrkoping': 378,
  'kalmar ff': 374,
  'kalmar': 374,
  'halmstad': 766,
  'halmstads bk': 766,
  'mjallby aif': 2240,
  'mjallby': 2240,
  'gais': 2170,
  'ifk varnamo': 2163,
  'varnamo': 2163,
  'vasteras sk': 2241,
  'vasteras sk fk': 2241,
  'vasteras': 2241,
  'if brommapojkarna': 371,
  'brommapojkarna': 371,
  'landskrona bois': 2176,
  'landskrona': 2176,
  // Superettan teams (2024)
  'degerfors if': 2166,
  'degerfors': 2166,
  'orgryte is': 2168,
  'orgryte': 2168,
  'helsingborgs if': 365,
  'helsingborg': 365,
  'gif sundsvall': 2167,
  'sundsvall': 2167,
  'orebro sk': 2169,
  'orebro': 2169,
  'jonkopings sodra if': 2164,
  'jonkopings sodra': 2164,
  'trelleborgs ff': 2165,
  'trelleborg': 2165,
  'varbergs bois': 2239,
  'varberg': 2239,
  'oskarshamns aik': 15586,
  'oskarhamn': 15586,
  'sandvikens if': 2173,
  'sandviken': 2173,
  'utsiktens bk': 2175,
  'utsikten': 2175,
  'gefle if': 2172,
  'gefle': 2172,
  'akropolis if': 2174,
  'akropolis': 2174,
  'brage': 2171,
  'ik brage': 2171,
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

export function getApiFootballLeagueId(leagueName: string): number | null {
  // Try exact match first
  if (LEAGUE_MAP[leagueName]) return LEAGUE_MAP[leagueName]
  // Try partial match
  const lower = leagueName.toLowerCase()
  for (const [key, id] of Object.entries(LEAGUE_MAP)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return id
    }
  }
  return null
}

export function getApiFootballTeamId(teamName: string): number | null {
  const norm = normalize(teamName)
  if (TEAM_MAP[norm]) return TEAM_MAP[norm]
  // Try partial match
  for (const [key, id] of Object.entries(TEAM_MAP)) {
    if (norm.includes(key) || key.includes(norm)) {
      return id
    }
  }
  return null
}
