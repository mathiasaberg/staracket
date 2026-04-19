import { useState, useCallback, useEffect } from 'react'
import { API } from '../lib/api'
import { findTeamLocation } from '../lib/teamLocations'
import type { Team, League, Event } from '../lib/types'
import styles from '../styles/Home.module.css'

type Props = {
  allLeagues: League[]
  selectedLeagueIds: number[]
  onGoToLeague: (l: League) => void
}

type PlottedTeam = Team & { lat: number; lng: number; city: string; leagueName: string; leagueId: number }

function toSvg(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - 11) / (24.2 - 11)) * 400 + 50
  const y = ((69.1 - lat) / (69.1 - 55.3)) * 700 + 30
  return { x, y }
}

const MAINLAND_PATH = "M388.9,201.3 L359.5,236.7 L364.2,267.7 L316.0,308.5 L257.5,352.1 L235.4,423.6 L257.0,459.3 L286.0,487.4 L258.2,544.7 L226.6,556.5 L215.1,641.7 L197.9,689.2 L161.1,684.3 L144.0,724.5 L108.9,726.9 L99.2,678.9 L73.9,621.4 L50.8,549.6 L64.2,520.4 L89.4,485.6 L99.4,426.0 L80.1,400.3 L78.2,332.9 L97.9,285.3 L127.9,286.2 L138.5,266.1 L127.4,248.8 L174.5,177.4 L204.8,121.2 L224.8,85.1 L253.9,85.3 L261.9,57.0 L319.0,65.1 L323.5,31.8 L342.3,29.7 L382.7,54.5 L430.0,89.0 L430.8,167.2 L441.0,186.9 L388.9,201.3 Z"
const GOTLAND_PATH = "M303.3,595.1 L286.5,610.7 L287.1,621.2 L292.3,621.3 L291.0,625.0 L283.1,628.3 L283.6,633.4 L276.1,637.3 L271.8,647.5 L265.3,649.3 L267.8,638.2 L264.3,630.2 L266.8,623.7 L265.0,616.1 L282.1,596.6 L293.6,596.0 L295.6,593.4 L303.8,593.2 L303.3,595.1 Z"
const OLAND_PATH = "M233.7,624.2 L238.2,627.2 L214.5,685.4 L212.5,666.3 L233.7,624.2 Z"

export default function SwedenMap({ allLeagues, selectedLeagueIds, onGoToLeague }: Props) {
  const [teams, setTeams] = useState<PlottedTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<PlottedTeam | null>(null)
  const [recentEvents, setRecentEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTeam, setLoadingTeam] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const found: PlottedTeam[] = []
      const seen = new Set<number>()
      // Use parallel batch loading via standings (faster than events)
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
              if (!t || seen.has(t.id)) continue
              seen.add(t.id)
              const loc = findTeamLocation(t.name)
              if (loc) {
                found.push({ ...t, ...loc, leagueName: league.name, leagueId: league.id })
              }
            }
          }
        }
      }
      if (!cancelled) {
        setTeams(found)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [allLeagues])

  const visibleTeams = selectedLeagueIds.length > 0
    ? teams.filter(t => selectedLeagueIds.includes(t.leagueId))
    : teams

  const selectTeam = useCallback(async (team: PlottedTeam) => {
    setSelectedTeam(team)
    setLoadingTeam(true)
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
    setLoadingTeam(false)
  }, [])

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapSvgWrap}>
        {loading ? (
          <div className={styles.modalEmpty}>Laddar lagpositioner…</div>
        ) : (
          <svg viewBox="0 0 500 780" className={styles.mapSvg}>
            <path d={MAINLAND_PATH} fill="var(--pitch3)" stroke="var(--border)" strokeWidth="2" />
            <path d={GOTLAND_PATH} fill="var(--pitch3)" stroke="var(--border)" strokeWidth="1.5" />
            <path d={OLAND_PATH} fill="var(--pitch3)" stroke="var(--border)" strokeWidth="1.5" />
            {visibleTeams.map(t => {
              const pos = toSvg(t.lat, t.lng)
              const isSelected = selectedTeam?.id === t.id
              return (
                <g key={t.id} onClick={() => selectTeam(t)} style={{ cursor: 'pointer' }}>
                  <circle
                    cx={pos.x} cy={pos.y} r={isSelected ? 8 : 5}
                    fill={isSelected ? 'var(--rust)' : 'var(--grass)'}
                    stroke="var(--text)" strokeWidth={isSelected ? 2 : 1}
                    opacity={isSelected ? 1 : 0.8}
                  />
                  {isSelected && (
                    <text x={pos.x + 12} y={pos.y + 4} fill="var(--text)" fontSize="12" fontFamily="Barlow Condensed">
                      {t.name}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <div className={styles.mapInfoPanel}>
        {selectedTeam ? (
          <div className={styles.teamInfoCard}>
            {loadingTeam ? (
              <div className={styles.modalEmpty}>Laddar…</div>
            ) : (
              <>
                <h3 className={styles.teamInfoName}>{selectedTeam.name}</h3>
                <div className={styles.teamInfoMeta}>{'📍'} {selectedTeam.city}</div>
                <div className={styles.teamInfoMeta}>
                  {'🏆'} {selectedTeam.leagueName}
                  <button
                    className={styles.teamInfoLink}
                    onClick={() => {
                      const lg = allLeagues.find(l => l.id === selectedTeam.leagueId)
                      if (lg) onGoToLeague(lg)
                    }}
                  >
                    Gå till serien {'→'}
                  </button>
                </div>
                {recentEvents.length > 0 && (
                  <>
                    <div className={styles.teamInfoLabel}>Senaste matcher</div>
                    {recentEvents.map(e => (
                      <div key={e.id} className={styles.teamInfoMatch}>
                        <span>{e.homeTeam.name}</span>
                        <span className={styles.teamInfoScore}>{e.homeTeamScore}{'–'}{e.visitingTeamScore}</span>
                        <span>{e.visitingTeam.name}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={styles.mapPlaceholder}>
            Klicka på en punkt för att se laginfo
          </div>
        )}
      </div>
    </div>
  )
}
