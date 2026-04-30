import { useEffect, useState, useCallback } from 'react'
import { API } from '../lib/api'
import { parseStandings } from '../lib/standings'
import { fmt, fmtTime } from '../lib/format'
import { getFavLeagues, getFavTeams } from '../lib/favorites'
import type { League, Event, ParsedStanding } from '../lib/types'
import styles from '../styles/Home.module.css'
import LoadingSpinner from './LoadingSpinner'

type Props = {
  allLeagues: League[]
  onGoToLeague: (league: League) => void
  onOpenMatch?: (event: Event) => void
}

type FavData = {
  league: League
  events: Event[]
}

type TeamDetail = {
  teamId: number
  teamName: string
  leagueName: string
  league: League
  nextEvent: Event | null
  recentEvents: Event[]
  upcomingEvents: Event[]
  position: { pos: number; total: number; pts: number } | null
  form: ('W' | 'D' | 'L')[]
  loading: boolean
}

export default function Dashboard({ allLeagues, onGoToLeague, onOpenMatch }: Props) {
  const [favData, setFavData] = useState<FavData[]>([])
  const [teamDetails, setTeamDetails] = useState<TeamDetail[]>([])
  const [loading, setLoading] = useState(true)
  const favLeagueIds = getFavLeagues()
  const favTeamIds = getFavTeams()

  useEffect(() => {
    if (favLeagueIds.length === 0 && favTeamIds.length === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      const leagueResults: FavData[] = []
      const teamMap = new Map<number, TeamDetail>()
      const favTeamSet = new Set(favTeamIds)

      // Load favorite leagues in parallel (batches of 5)
      const leaguesToLoad = allLeagues.filter(l => favLeagueIds.includes(l.id))
      const batchSize = 5
      for (let i = 0; i < leaguesToLoad.length; i += batchSize) {
        if (cancelled) return
        const batch = leaguesToLoad.slice(i, i + batchSize)
        const results = await Promise.allSettled(
          batch.map(league => API('events', { league: league.id, limit: 100 }).then(data => ({ league, data })))
        )
        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          const { league, data } = r.value
          const events: Event[] = data.events || []
          const finished = events.filter(e => e.status === 'FINISHED').slice(-3)
          const upcoming = events.filter(e => e.status !== 'FINISHED').slice(0, 3)
          leagueResults.push({ league, events: [...finished.reverse(), ...upcoming] })

          // Build team details for fav teams found in these leagues
          if (favTeamSet.size > 0) {
            for (const tid of Array.from(favTeamSet)) {
              if (teamMap.has(tid)) continue
              const teamEvents = events.filter(
                e => e.homeTeam?.id === tid || e.visitingTeam?.id === tid
              )
              if (teamEvents.length > 0) {
                const teamName = teamEvents[0].homeTeam?.id === tid
                  ? teamEvents[0].homeTeam.name
                  : teamEvents[0].visitingTeam.name
                const finishedTeam = teamEvents.filter(e => e.status === 'FINISHED')
                const upcomingTeam = teamEvents.filter(e => e.status !== 'FINISHED')
                const form: ('W' | 'D' | 'L')[] = []
                for (const e of finishedTeam.slice(-5)) {
                  const hs = e.homeTeamScore ?? 0
                  const as = e.visitingTeamScore ?? 0
                  const isHome = e.homeTeam?.id === tid
                  if (isHome) form.push(hs > as ? 'W' : hs === as ? 'D' : 'L')
                  else form.push(as > hs ? 'W' : hs === as ? 'D' : 'L')
                }
                teamMap.set(tid, {
                  teamId: tid,
                  teamName,
                  leagueName: league.name,
                  league,
                  nextEvent: upcomingTeam[0] || null,
                  recentEvents: finishedTeam.slice(-3).reverse(),
                  upcomingEvents: upcomingTeam.slice(0, 3),
                  position: null,
                  form,
                  loading: true,
                })
              }
            }
          }
        }
      }

      // Search for fav teams in other leagues if not found yet (batches of 5)
      if (favTeamSet.size > 0) {
        const missingIds = favTeamIds.filter(id => !teamMap.has(id))
        if (missingIds.length > 0) {
          const missingSet = new Set(missingIds)
          const otherLeagues = allLeagues.filter(l => !favLeagueIds.includes(l.id)).slice(0, 30)
          for (let i = 0; i < otherLeagues.length && missingSet.size > 0; i += batchSize) {
            if (cancelled) return
            const batch = otherLeagues.slice(i, i + batchSize)
            const results = await Promise.allSettled(
              batch.map(league => API('events', { league: league.id, limit: 100 }).then(data => ({ league, data })))
            )
            for (const r of results) {
              if (r.status !== 'fulfilled') continue
              const { league, data } = r.value
              const events: Event[] = data.events || []
              for (const tid of Array.from(missingSet)) {
                const teamEvents = events.filter(
                  e => e.homeTeam?.id === tid || e.visitingTeam?.id === tid
                )
                if (teamEvents.length > 0) {
                  const teamName = teamEvents[0].homeTeam?.id === tid
                    ? teamEvents[0].homeTeam.name
                    : teamEvents[0].visitingTeam.name
                  const finishedTeam = teamEvents.filter(e => e.status === 'FINISHED')
                  const upcomingTeam = teamEvents.filter(e => e.status !== 'FINISHED')
                  const form: ('W' | 'D' | 'L')[] = []
                  for (const e of finishedTeam.slice(-5)) {
                    const hs = e.homeTeamScore ?? 0
                    const as = e.visitingTeamScore ?? 0
                    const isHome = e.homeTeam?.id === tid
                    if (isHome) form.push(hs > as ? 'W' : hs === as ? 'D' : 'L')
                    else form.push(as > hs ? 'W' : hs === as ? 'D' : 'L')
                  }
                  teamMap.set(tid, {
                    teamId: tid,
                    teamName,
                    leagueName: league.name,
                    league,
                    nextEvent: upcomingTeam[0] || null,
                    recentEvents: finishedTeam.slice(-3).reverse(),
                    upcomingEvents: upcomingTeam.slice(0, 3),
                    position: null,
                    form,
                    loading: true,
                  })
                  missingSet.delete(tid)
                }
              }
            }
          }
        }
      }

      if (cancelled) return

      // Fetch standings for each team's league in parallel
      const leagueIdsToFetch = Array.from(new Set(Array.from(teamMap.values()).map(t => t.league.id)))
      const standingsResults = await Promise.allSettled(
        leagueIdsToFetch.map(lid => API(`leagues/${lid}/standings`).then(data => ({ lid, data })))
      )
      for (const r of standingsResults) {
        if (r.status === 'fulfilled') {
          const { lid, data: stData } = r.value
          const standings = parseStandings(stData)
          Array.from(teamMap.values()).forEach(td => {
            if (td.league.id !== lid) return
            const myStanding = standings.find(s => s.team?.id === td.teamId)
            if (myStanding) {
              td.position = { pos: myStanding.position, total: standings.length, pts: myStanding.pts }
            }
            td.loading = false
          })
        } else {
          // Mark as done even on failure
          const lid = leagueIdsToFetch[standingsResults.indexOf(r)]
          Array.from(teamMap.values()).forEach(td => {
            if (td.league.id === lid) td.loading = false
          })
        }
      }

      if (!cancelled) {
        setFavData(leagueResults)
        setTeamDetails(Array.from(teamMap.values()))
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [allLeagues, favLeagueIds.length, favTeamIds.length])

  if (favLeagueIds.length === 0 && favTeamIds.length === 0) {
    return (
      <div className={styles.dashboardEmpty}>
        <h2>Min dashboard</h2>
        <p>Du har inga favoriter ännu.</p>
        <p>Markera ligor och lag med {'★'} i serievyn för att följa dem här.</p>
      </div>
    )
  }

  return (
    <div className={styles.dashboard}>
      <h2 className={styles.dashboardTitle}>Min dashboard</h2>
      {loading ? (
        <LoadingSpinner message="Laddar favoriter…" />
      ) : (
        <div className={styles.dashboardGrid}>
          {/* Left column: Favorite teams with details */}
          <div className={styles.dashboardCol}>
            <div className={styles.dashboardColTitle}>Favoritlag</div>
            {teamDetails.length === 0 ? (
              <div className={styles.dashboardColEmpty}>
                {favTeamIds.length === 0
                  ? 'Markera lag med ★ i tabellen för att se deras nästa match här.'
                  : 'Inga matcher hittades för dina favoritlag.'}
              </div>
            ) : (
              teamDetails.map(td => (
                <div key={td.teamId} className={styles.teamInfoCard}>
                  <h3 className={styles.teamInfoName}>{td.teamName}</h3>
                  <div className={styles.teamInfoMeta}>
                    {'🏆'} {td.leagueName}
                    {td.position && (
                      <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                        #{td.position.pos}/{td.position.total} · {td.position.pts}p
                      </span>
                    )}
                    <button className={styles.teamInfoLink} onClick={() => onGoToLeague(td.league)}>
                      Gå till serien {'→'}
                    </button>
                  </div>
                  {td.form.length > 0 && (
                    <div style={{ display: 'flex', gap: 3, margin: '6px 0' }}>
                      {td.form.map((r, i) => (
                        <span key={i} className={`${styles.formDot} ${r === 'W' ? styles.formWin : r === 'D' ? styles.formDraw : styles.formLoss}`}>
                          {r === 'W' ? 'V' : r === 'D' ? 'O' : 'F'}
                        </span>
                      ))}
                    </div>
                  )}
                  {td.recentEvents.length > 0 && (
                    <>
                      <div className={styles.teamInfoLabel}>Senaste matcher</div>
                      {td.recentEvents.map(e => (
                        <div key={e.id} className={styles.teamInfoMatch} style={{ cursor: 'pointer' }} onClick={() => onOpenMatch?.(e)}>
                          <span>{e.homeTeam?.name}</span>
                          <span className={styles.teamInfoScore}>{e.homeTeamScore}{'–'}{e.visitingTeamScore}</span>
                          <span>{e.visitingTeam?.name}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {td.upcomingEvents.length > 0 && (
                    <>
                      <div className={styles.teamInfoLabel}>Kommande matcher</div>
                      {td.upcomingEvents.map(e => (
                        <div key={e.id} className={styles.teamInfoMatch} style={{ cursor: 'pointer' }} onClick={() => onOpenMatch?.(e)}>
                          <span>{e.homeTeam?.name}</span>
                          <span className={styles.teamInfoScore} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {e.startDate ? `${fmt(e.startDate)} ${fmtTime(e.startDate)}` : '–'}
                          </span>
                          <span>{e.visitingTeam?.name}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Right column: Favorite series */}
          <div className={styles.dashboardCol}>
            <div className={styles.dashboardColTitle}>Favoritserier</div>
            {favData.length === 0 ? (
              <div className={styles.dashboardColEmpty}>
                {favLeagueIds.length === 0
                  ? 'Markera serier med ★ i sidomenyn för att följa dem här.'
                  : 'Inga matcher hittades för dina favoritserier.'}
              </div>
            ) : (
              favData.map(fd => (
                <div key={fd.league.id} className={styles.dashboardSection}>
                  <div className={styles.dashboardLeague} onClick={() => onGoToLeague(fd.league)}>
                    {fd.league.name} {'→'}
                  </div>
                  <div className={styles.matchesGrid}>
                    {fd.events.map(e => {
                      const done = e.status === 'FINISHED'
                      const isFavTeam = favTeamIds.includes(e.homeTeam?.id) || favTeamIds.includes(e.visitingTeam?.id)
                      return (
                        <div key={e.id} className={`${styles.matchCard} ${isFavTeam ? styles.matchCardFav : ''}`}
                          onClick={() => onOpenMatch?.(e)}
                          style={{ cursor: onOpenMatch ? 'pointer' : 'default' }}
                        >
                          <div className={styles.matchHome}>{e.homeTeam?.name || '—'}</div>
                          <div className={`${styles.matchScore} ${done ? '' : styles.upcoming}`}>
                            {done ? `${e.homeTeamScore}–${e.visitingTeamScore}` : fmt(e.startDate)}
                          </div>
                          <div className={styles.matchAway}>{e.visitingTeam?.name || '—'}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
