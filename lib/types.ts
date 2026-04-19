export type League = {
  id: number; name: string; teamClass?: string; teamClassId?: number
  season?: { startYear: number; endYear: number }
  sport?: { id: number; name: string }
}
export type Team = { id: number; name: string; shortName?: string; logo?: string }
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
export type MatchModalData = {
  baseEvent: Event; event: any; facts: MatchFact[]; loading: boolean
}
export type ParsedStanding = {
  position: number; team: Team
  gp: number; w: number; d: number; l: number
  gf: number; ga: number; gd: number; pts: number
  zone: 'up' | 'playoff' | 'down' | ''
}
