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

export default function Dashboard({ allLeagues, onGoToLeague, onOpenMatch }: Props) {
  const [favData, setFavData] = useState<FavData[]>([])
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
      const results: FavData[] = []
      const leaguesToLoad = allLeagues.filter(l => favLeagueIds.includes(l.id))
      for (const league of leaguesToLoad) {
        try {
          const data = await API('events', { league: league.id, limit: 100 })
          const events: Event[] = data.events || []
          // Show recent finished + upcoming
          const finished = events.filter(e => e.status === 'FINISHED').slice(-3)
          const upcoming = events.filter(e => e.status !== 'FINISHED').slice(0, 3)
          results.push({ league, events: [...finished.reverse(), ...upcoming] })
        } catch { /* skip */ }
      }
      // Also find events for fav teams in any league
      if (favTeamIds.length > 0 && results.length === 0) {
        for (const league of allLeagues.slice(0, 20)) {
          try {
            const data = await API('events', { league: league.id, limit: 100 })
            const events: Event[] = data.events || []
            const teamEvents = events.filter(
              e => favTeamIds.includes(e.homeTeam?.id) || favTeamIds.includes(e.visitingTeam?.id)
            )
            if (teamEvents.length > 0) {
              results.push({ league, events: teamEvents.slice(-5) })
            }
          } catch { /* skip */ }
        }
      }
      if (!cancelled) {
        setFavData(results)
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
      ) : favData.length === 0 ? (
        <div className={styles.modalEmpty}>Inga matcher hittades för dina favoriter</div>
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
                    style={{cursor: onOpenMatch ? 'pointer' : 'default'}}
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
  )
}
