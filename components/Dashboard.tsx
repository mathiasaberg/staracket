import { useEffect, useState, useCallback } from 'react'
import { API } from '../lib/api'
import { fmt, fmtTime } from '../lib/format'
import { getFavLeagues, getFavTeams } from '../lib/favorites'
import type { League, Event } from '../lib/types'
import styles from '../styles/Home.module.css'

type Props = {
  allLeagues: League[]
  onGoToLeague: (league: League) => void
  onOpenMatch?: (event: Event) => void
}

type FavData = {
  league: League
  events: Event[]
}

type TeamNextMatch = {
  teamId: number
  teamName: string
  leagueName: string
  league: League
  event: Event
}

export default function Dashboard({ allLeagues, onGoToLeague, onOpenMatch }: Props) {
  const [favData, setFavData] = useState<FavData[]>([])
  const [teamMatches, setTeamMatches] = useState<TeamNextMatch[]>([])
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
      const teamResults: TeamNextMatch[] = []
      const favTeamSet = new Set(favTeamIds)

      // Load favorite leagues
      const leaguesToLoad = allLeagues.filter(l => favLeagueIds.includes(l.id))
      for (const league of leaguesToLoad) {
        try {
          const data = await API('events', { league: league.id, limit: 100 })
          const events: Event[] = data.events || []
          const finished = events.filter(e => e.status === 'FINISHED').slice(-3)
          const upcoming = events.filter(e => e.status !== 'FINISHED').slice(0, 3)
          leagueResults.push({ league, events: [...finished.reverse(), ...upcoming] })

          // Also check for fav teams in these leagues
          if (favTeamSet.size > 0) {
            for (const e of events) {
              const homeMatch = favTeamSet.has(e.homeTeam?.id)
              const awayMatch = favTeamSet.has(e.visitingTeam?.id)
              if (homeMatch && e.status !== 'FINISHED') {
                const existing = teamResults.find(t => t.teamId === e.homeTeam.id)
                if (!existing) {
                  teamResults.push({ teamId: e.homeTeam.id, teamName: e.homeTeam.name, leagueName: league.name, league, event: e })
                }
              }
              if (awayMatch && e.status !== 'FINISHED') {
                const existing = teamResults.find(t => t.teamId === e.visitingTeam.id)
                if (!existing) {
                  teamResults.push({ teamId: e.visitingTeam.id, teamName: e.visitingTeam.name, leagueName: league.name, league, event: e })
                }
              }
            }
          }
        } catch { /* skip */ }
      }

      // Search for fav team matches in other leagues if not found yet
      if (favTeamSet.size > 0) {
        const foundTeamIds = new Set(teamResults.map(t => t.teamId))
        const missingTeamIds = favTeamIds.filter(id => !foundTeamIds.has(id))
        if (missingTeamIds.length > 0) {
          const missingSet = new Set(missingTeamIds)
          for (const league of allLeagues.slice(0, 30)) {
            if (missingSet.size === 0) break
            if (favLeagueIds.includes(league.id)) continue // already loaded
            try {
              const data = await API('events', { league: league.id, limit: 100 })
              const events: Event[] = data.events || []
              for (const e of events) {
                if (e.status === 'FINISHED') continue
                if (missingSet.has(e.homeTeam?.id)) {
                  teamResults.push({ teamId: e.homeTeam.id, teamName: e.homeTeam.name, leagueName: league.name, league, event: e })
                  missingSet.delete(e.homeTeam.id)
                }
                if (missingSet.has(e.visitingTeam?.id)) {
                  teamResults.push({ teamId: e.visitingTeam.id, teamName: e.visitingTeam.name, leagueName: league.name, league, event: e })
                  missingSet.delete(e.visitingTeam.id)
                }
              }
            } catch { /* skip */ }
          }
        }
      }

      if (!cancelled) {
        setFavData(leagueResults)
        setTeamMatches(teamResults)
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
        <div className={styles.modalEmpty}>Laddar favoriter…</div>
      ) : (
        <div className={styles.dashboardGrid}>
          {/* Left column: Favorite teams next match */}
          <div className={styles.dashboardCol}>
            <div className={styles.dashboardColTitle}>Favoritlag</div>
            {teamMatches.length === 0 ? (
              <div className={styles.dashboardColEmpty}>
                {favTeamIds.length === 0
                  ? 'Markera lag med ★ i tabellen för att se deras nästa match här.'
                  : 'Inga kommande matcher hittades.'}
              </div>
            ) : (
              teamMatches.map(tm => (
                <div key={tm.teamId} className={styles.dashboardTeamCard}>
                  <div className={styles.dashboardTeamName}>{tm.teamName}</div>
                  <div className={styles.dashboardTeamLeague} onClick={() => onGoToLeague(tm.league)}>
                    {tm.leagueName} {'→'}
                  </div>
                  <div
                    className={`${styles.matchCard} ${styles.matchCardFav}`}
                    onClick={() => onOpenMatch?.(tm.event)}
                    style={{ cursor: onOpenMatch ? 'pointer' : 'default' }}
                  >
                    <div className={styles.matchHome}>{tm.event.homeTeam?.name || '—'}</div>
                    <div className={`${styles.matchScore} ${styles.upcoming}`}>
                      {tm.event.startDate ? `${fmt(tm.event.startDate)} ${fmtTime(tm.event.startDate)}` : '—'}
                    </div>
                    <div className={styles.matchAway}>{tm.event.visitingTeam?.name || '—'}</div>
                  </div>
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
