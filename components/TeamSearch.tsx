import { useState, useEffect, useCallback } from 'react'
import { API } from '../lib/api'
import { fmt, fmtTime } from '../lib/format'
import { findTeamLocation } from '../lib/teamLocations'
import type { Team, Event, League } from '../lib/types'
import styles from '../styles/Home.module.css'

type Props = {
  allLeagues: League[]
  onGoToLeague: (league: League) => void
}

type IndexedTeam = Team & { leagueId: number; leagueName: string }

export default function TeamSearch({ allLeagues, onGoToLeague }: Props) {
  const [query, setQuery] = useState('')
  const [teamIndex, setTeamIndex] = useState<IndexedTeam[]>([])
  const [indexLoading, setIndexLoading] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<IndexedTeam | null>(null)
  const [teamLeague, setTeamLeague] = useState<League | null>(null)
  const [recentEvents, setRecentEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(false)

  // Build team index once on mount using parallel standings requests
  useEffect(() => {
    let cancelled = false
    async function buildIndex() {
      setIndexLoading(true)
      const teams: IndexedTeam[] = []
      const seen = new Set<number>()
      const batchSize = 10
      for (let i = 0; i < allLeagues.length && !cancelled; i += batchSize) {
        const batch = allLeagues.slice(i, i + batchSize)
        const results = await Promise.allSettled(
          batch.map(league =>
            API(`leagues/${league.id}/standings`).then(data => ({ league, data }))
          )
        )
        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          const { league, data } = r.value
          for (const group of (data.groups || [])) {
            for (const entry of (group.standings || [])) {
              const t = entry.team
              if (t && !seen.has(t.id)) {
                seen.add(t.id)
                teams.push({ ...t, leagueId: league.id, leagueName: league.name })
              }
            }
          }
        }
      }
      if (!cancelled) {
        setTeamIndex(teams)
        setIndexLoading(false)
      }
    }
    buildIndex()
    return () => { cancelled = true }
  }, [allLeagues])

  // Filter teams locally from the index
  const results = query.length >= 2
    ? teamIndex.filter(t => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 15)
    : []

  const selectTeam = useCallback(async (team: IndexedTeam) => {
    setSelectedTeam(team)
    setQuery(team.name)
    setLoading(true)
    const league = allLeagues.find(l => l.id === team.leagueId)
    setTeamLeague(league || null)
    try {
      const data = await API('events', { league: team.leagueId, limit: 200 })
      const events: Event[] = data.events || []
      const teamEvents = events.filter(
        e => e.homeTeam?.id === team.id || e.visitingTeam?.id === team.id
      )
      const finished = teamEvents.filter(e => e.status === 'FINISHED')
      setRecentEvents(finished.slice(-5).reverse())
    } catch {
      setRecentEvents([])
    }
    setLoading(false)
  }, [allLeagues])

  const loc = selectedTeam ? findTeamLocation(selectedTeam.name) : null

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchInputWrap}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={indexLoading ? "Laddar lagregister…" : "Sök lag..."}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedTeam(null) }}
          disabled={indexLoading}
        />
        {query && (
          <button className={styles.searchClear} onClick={() => { setQuery(''); setSelectedTeam(null) }}>✕</button>
        )}
      </div>

      {results.length > 0 && !selectedTeam && (
        <div className={styles.searchResults}>
          {results.map(t => (
            <div key={t.id} className={styles.searchResultItem} onClick={() => selectTeam(t)}>
              {t.name}
              <span style={{color:'var(--text-muted)',fontSize:12,marginLeft:8}}>{t.leagueName}</span>
            </div>
          ))}
        </div>
      )}

      {selectedTeam && (
        <div className={styles.teamInfoCard}>
          {loading ? (
            <div className={styles.modalEmpty}>Laddar laginfo…</div>
          ) : (
            <>
              <h3 className={styles.teamInfoName}>{selectedTeam.name}</h3>
              {loc && <div className={styles.teamInfoMeta}>📍 {loc.city}</div>}
              {teamLeague && (
                <div className={styles.teamInfoMeta}>
                  🏆 {teamLeague.name}
                  <button
                    className={styles.teamInfoLink}
                    onClick={() => onGoToLeague(teamLeague)}
                  >
                    Gå till serien →
                  </button>
                </div>
              )}
              {recentEvents.length > 0 && (
                <>
                  <div className={styles.teamInfoLabel}>Senaste matcher</div>
                  {recentEvents.map(e => (
                    <div key={e.id} className={styles.teamInfoMatch}>
                      <span style={{textAlign:'right'}}>{e.homeTeam?.name}</span>
                      <span className={styles.teamInfoScore}>
                        {e.homeTeamScore}–{e.visitingTeamScore}
                      </span>
                      <span>{e.visitingTeam?.name}</span>
                    </div>
                  ))}
                </>
              )}
              {recentEvents.length === 0 && !loading && (
                <div className={styles.modalEmpty}>Inga matcher hittades</div>
              )}
            </>
          )}
        </div>
      )}

      {indexLoading && (
        <div className={styles.modalEmpty}>Bygger lagregister…</div>
      )}
    </div>
  )
}
