export type League = {
  id: number; name: string; teamClass?: string; teamClassId?: number
  season?: { name?: string; startYear: number; endYear: number }
  sport?: { id: number; name: string }
}
export type Team = { id: number; name: string; shortName?: string; logo?: string; arena?: { id?: number; name?: string; city?: string } }
export type Event = {
  id: number; round: number; status: string; startDate: string
  homeTeam: Team; visitingTeam: Team
  homeTeamScore?: number; visitingTeamScore?: number
}
export type MatchFact = {
  type?: string; minute?: number | string; team?: Team
  player?: { id: number; name: string }
  assistant?: { id: number; name: string }
  description?: string
}
export type ApiFootballEvent = {
  time: { elapsed: number; extra: number | null }
  team: { id: number; name: string; logo: string }
  player: { id: number; name: string }
  assist: { id: number | null; name: string | null }
  type: string   // Goal, Card, subst
  detail: string // Normal Goal, Yellow Card, Red Card, Substitution 1, etc.
  comments: string | null
}
export type ApiFootballLineupPlayer = {
  id: number; name: string; number: number; pos: string; grid: string | null
}
export type ApiFootballLineup = {
  team: { id: number; name: string; logo: string; colors: any }
  coach: { id: number; name: string; photo: string }
  formation: string
  startXI: { player: ApiFootballLineupPlayer }[]
  substitutes: { player: ApiFootballLineupPlayer }[]
}
export type MatchModalData = {
  baseEvent: Event; event: any; facts: MatchFact[]; loading: boolean
  apiEvents?: ApiFootballEvent[]
  apiLineups?: ApiFootballLineup[]
  apiLoading?: boolean
}
export type ParsedStanding = {
  position: number; team: Team
  gp: number; w: number; d: number; l: number
  gf: number; ga: number; gd: number; pts: number
  zone: 'up' | 'playoff' | 'down' | ''
}
