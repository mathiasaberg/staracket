import { useState, useCallback, useEffect, useMemo } from 'react'
import { API } from '../lib/api'
import { findTeamLocation } from '../lib/teamLocations'
import type { Team, League, Event } from '../lib/types'
import styles from '../styles/Home.module.css'

type Props = {
  allLeagues: League[]
  selectedLeagueIds: number[]
  onGoToLeague: (l: League) => void
}

type PlottedTeam = Team & { lat: number; lng: number; city: string; leagueName: string; leagueId: number; arenaName?: string; municipality?: string }

type Cluster = {
  x: number; y: number; teams: PlottedTeam[]; expanded: boolean
}

function toSvg(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - 11) / (24.2 - 11)) * 400 + 50
  const y = ((69.1 - lat) / (69.1 - 55.3)) * 700 + 30
  return { x, y }
}

const MAINLAND = [[22.183173,65.723741],[21.213517,65.026005],[21.369631,64.413588],[19.778876,63.609554],[17.847779,62.7494],[17.119555,61.341166],[17.831346,60.636583],[18.787722,60.081914],[17.869225,58.953766],[16.829185,58.719827],[16.44771,57.041118],[15.879786,56.104302],[14.666681,56.200885],[14.100721,55.407781],[12.942911,55.361737],[12.625101,56.30708],[11.787942,57.441817],[11.027369,58.856149],[11.468272,59.432393],[12.300366,60.117933],[12.631147,61.293572],[11.992064,61.800362],[11.930569,63.128318],[12.579935,64.066219],[13.571916,64.049114],[13.919905,64.445421],[13.55569,64.787028],[15.108411,66.193867],[16.108712,67.302456],[16.768879,68.013937],[17.729182,68.010552],[17.993868,68.567391],[19.87856,68.407194],[20.025269,69.065139],[20.645593,69.106247],[21.978535,68.616846],[23.539473,67.936009],[23.56588,66.396051],[23.903379,66.006927],[22.183173,65.723741]]
const GOTLAND = [[19.35791,57.958588],[18.8031,57.651279],[18.825073,57.444949],[18.995361,57.441993],[18.951416,57.370976],[18.693237,57.305756],[18.709716,57.204734],[18.462524,57.127295],[18.319702,56.926992],[18.105468,56.891003],[18.187866,57.109402],[18.072509,57.267163],[18.154907,57.394664],[18.094482,57.545312],[18.660278,57.929434],[19.039306,57.941098],[19.105224,57.993543],[19.374389,57.996454],[19.35791,57.958588]]
const OLAND = [[17.061767,57.385783],[17.210083,57.326521],[16.430053,56.179196],[16.364135,56.556455],[17.061767,57.385783]]

function makePath(coords: number[][]): string {
  return coords.map((p, i) => {
    const { x, y } = toSvg(p[1], p[0])
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z'
}

const MAINLAND_PATH = makePath(MAINLAND)
const GOTLAND_PATH = makePath(GOTLAND)
const OLAND_PATH = makePath(OLAND)

const CLUSTER_DIST = 18 // px distance to merge dots

function buildClusters(teams: PlottedTeam[]): Cluster[] {
  const clusters: Cluster[] = []
  const used = new Set<number>()
  for (let i = 0; i < teams.length; i++) {
    if (used.has(i)) continue
    const pos = toSvg(teams[i].lat, teams[i].lng)
    const group: PlottedTeam[] = [teams[i]]
    used.add(i)
    for (let j = i + 1; j < teams.length; j++) {
      if (used.has(j)) continue
      const p2 = toSvg(teams[j].lat, teams[j].lng)
      const dx = pos.x - p2.x
      const dy = pos.y - p2.y
      if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_DIST) {
        group.push(teams[j])
        used.add(j)
      }
    }
    clusters.push({ x: pos.x, y: pos.y, teams: group, expanded: false })
  }
  return clusters
}

export default function SwedenMap({ allLeagues, selectedLeagueIds, onGoToLeague }: Props) {
  const [teams, setTeams] = useState<PlottedTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<PlottedTeam | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<number>(-1)
  const [recentEvents, setRecentEvents] = useState<Event[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [teamPosition, setTeamPosition] = useState<{ pos: number; total: number; pts: number; form: ('W'|'D'|'L')[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [missingCount, setMissingCount] = useState(0)
  const [missingTeams, setMissingTeams] = useState<{ name: string; leagueName: string }[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const found: PlottedTeam[] = []
      const seen = new Set<number>()
      let totalTeams = 0
      let mappedTeams = 0
      const missing: { name: string; leagueName: string }[] = []
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
              if (!t) continue
              totalTeams++
              if (seen.has(t.id)) continue
              seen.add(t.id)
              const loc = findTeamLocation(t.name)
              if (loc) {
                found.push({ ...t, ...loc, leagueName: league.name, leagueId: league.id, arenaName: t.arena?.name || undefined, municipality: t.municipality?.name || undefined })
                mappedTeams++
              } else {
                missing.push({ name: t.name, leagueName: league.name })
              }
            }
          }
        }
      }
      if (!cancelled) {
        setTeams(found)
        setMissingCount(seen.size - mappedTeams)
        setMissingTeams(missing)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [allLeagues])

  const visibleTeams = selectedLeagueIds.length > 0
    ? teams.filter(t => selectedLeagueIds.includes(t.leagueId))
    : teams

  const clusters = useMemo(() => buildClusters(visibleTeams), [visibleTeams])

  const selectTeam = useCallback(async (team: PlottedTeam) => {
    setSelectedTeam(team)
    setLoadingTeam(true)
    setTeamPosition(null)
    try {
      const [evData, stData] = await Promise.all([
        API('events', { league: team.leagueId, limit: 200 }),
        API(`leagues/${team.leagueId}/standings`)
      ])
      const events: Event[] = evData.events || []
      const teamEvents = events.filter(
        e => e.homeTeam?.id === team.id || e.visitingTeam?.id === team.id
      )
      const finished = teamEvents.filter(e => e.status === 'FINISHED')
      const upcoming = teamEvents.filter(e => e.status !== 'FINISHED')
      setRecentEvents(finished.slice(-5).reverse())
      setUpcomingEvents(upcoming.slice(0, 3))

      // Parse standings position and form
      const standings = (stData.groups || []).flatMap((g: any) => g.standings || [])
      const myStanding = standings.find((s: any) => s.team?.id === team.id)
      if (myStanding) {
        const total = standings.length
        const pos = standings.indexOf(myStanding) + 1
        // Compute form from last 5 finished
        const form: ('W'|'D'|'L')[] = []
        for (const e of finished) {
          const hs = e.homeTeamScore ?? 0
          const as = e.visitingTeamScore ?? 0
          const isHome = e.homeTeam?.id === team.id
          if (isHome) form.push(hs > as ? 'W' : hs === as ? 'D' : 'L')
          else form.push(as > hs ? 'W' : hs === as ? 'D' : 'L')
        }
        setTeamPosition({ pos, total, pts: myStanding.stats?.pts ?? 0, form: form.slice(-5) })
      }
    } catch {
      setRecentEvents([])
      setUpcomingEvents([])
    }
    setLoadingTeam(false)
  }, [])

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapSvgWrap}>
        {loading ? (
          <div className={styles.modalEmpty}>Laddar lagpositioner…</div>
        ) : (
          <>
            <svg viewBox="0 0 500 780" className={styles.mapSvg}>
              <path d={MAINLAND_PATH} fill="var(--pitch3)" stroke="var(--border)" strokeWidth="2" />
              <path d={GOTLAND_PATH} fill="var(--pitch3)" stroke="var(--border)" strokeWidth="1.5" />
              <path d={OLAND_PATH} fill="var(--pitch3)" stroke="var(--border)" strokeWidth="1.5" />
              {clusters.map((c, ci) => {
                if (c.teams.length === 1) {
                  const t = c.teams[0]
                  const isSelected = selectedTeam?.id === t.id
                  return (
                    <g key={t.id} onClick={() => selectTeam(t)} style={{ cursor: 'pointer' }}>
                      <circle cx={c.x} cy={c.y} r={isSelected ? 8 : 5}
                        fill={isSelected ? 'var(--rust)' : 'var(--grass)'}
                        stroke="var(--text)" strokeWidth={isSelected ? 2 : 1} opacity={isSelected ? 1 : 0.8} />
                      {isSelected && (
                        <text x={c.x + 12} y={c.y + 4} fill="var(--text)" fontSize="12" fontFamily="Barlow Condensed">{t.name}</text>
                      )}
                    </g>
                  )
                }
                // Cluster with multiple teams
                const isExpanded = expandedCluster === ci
                if (!isExpanded) {
                  return (
                    <g key={`cluster-${ci}`} onClick={() => setExpandedCluster(ci)} style={{ cursor: 'pointer' }}>
                      <circle cx={c.x} cy={c.y} r={10} fill="var(--grass)" stroke="var(--text)" strokeWidth="1.5" opacity={0.9} />
                      <text x={c.x} y={c.y + 4} fill="var(--text)" fontSize="11" fontWeight="700" textAnchor="middle" fontFamily="Barlow Condensed">
                        {c.teams.length}
                      </text>
                    </g>
                  )
                }
                // Show expanded cluster as a ring of dots
                return (
                  <g key={`cluster-${ci}`}>
                    {c.teams.map((t, ti) => {
                      const angle = (ti / c.teams.length) * 2 * Math.PI - Math.PI / 2
                      const radius = 6 + c.teams.length * 4
                      const tx = c.x + Math.cos(angle) * radius
                      const ty = c.y + Math.sin(angle) * radius
                      const isSelected = selectedTeam?.id === t.id
                      return (
                        <g key={t.id} onClick={() => selectTeam(t)} style={{ cursor: 'pointer' }}>
                          <line x1={c.x} y1={c.y} x2={tx} y2={ty} stroke="var(--border)" strokeWidth="1" opacity="0.4" />
                          <circle cx={tx} cy={ty} r={isSelected ? 7 : 4}
                            fill={isSelected ? 'var(--rust)' : 'var(--grass)'}
                            stroke="var(--text)" strokeWidth={isSelected ? 2 : 1} opacity={isSelected ? 1 : 0.8} />
                          <text x={tx + 8} y={ty + 3} fill="var(--text)" fontSize="10" fontFamily="Barlow Condensed" opacity="0.9">
                            {t.shortName || t.name.slice(0, 12)}
                          </text>
                        </g>
                      )
                    })}
                    <circle cx={c.x} cy={c.y} r={3} fill="var(--text-muted)" opacity="0.5"
                      onClick={() => setExpandedCluster(-1)} style={{ cursor: 'pointer' }} />
                  </g>
                )
              })}
            </svg>
            {missingCount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                {visibleTeams.length} lag på kartan · {missingCount} saknar position
              </div>
            )}
          </>
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
                <div className={styles.teamInfoMeta}>{'📍'} {selectedTeam.city}{selectedTeam.municipality && selectedTeam.municipality !== selectedTeam.city ? ` (${selectedTeam.municipality})` : ''}</div>
                {selectedTeam.arenaName && (
                  <div className={styles.teamInfoMeta}>{'🏟️'} {selectedTeam.arenaName}</div>
                )}
                <div className={styles.teamInfoMeta}>
                  {'🏆'} {selectedTeam.leagueName}
                  {teamPosition && (
                    <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                      #{teamPosition.pos}/{teamPosition.total} · {teamPosition.pts}p
                    </span>
                  )}
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
                {teamPosition && teamPosition.form.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, margin: '6px 0' }}>
                    {teamPosition.form.map((r, i) => (
                      <span key={i} className={`${styles.formDot} ${r === 'W' ? styles.formWin : r === 'D' ? styles.formDraw : styles.formLoss}`}>
                        {r === 'W' ? 'V' : r === 'D' ? 'O' : 'F'}
                      </span>
                    ))}
                  </div>
                )}
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
                {upcomingEvents.length > 0 && (
                  <>
                    <div className={styles.teamInfoLabel}>Kommande matcher</div>
                    {upcomingEvents.map(e => (
                      <div key={e.id} className={styles.teamInfoMatch}>
                        <span>{e.homeTeam.name}</span>
                        <span className={styles.teamInfoScore} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {e.startDate ? new Date(e.startDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) : '–'}
                        </span>
                        <span>{e.visitingTeam.name}</span>
                      </div>
                    ))}
                  </>
                )}
                {(() => {
                  const leagueMissing = missingTeams.filter(m => m.leagueName === selectedTeam.leagueName)
                  if (!leagueMissing.length) return null
                  return (
                    <>
                      <div className={styles.teamInfoLabel} style={{ color: 'var(--rust)' }}>
                        Saknar position ({leagueMissing.length})
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        {leagueMissing.map(m => m.name).join(', ')}
                      </div>
                    </>
                  )
                })()}
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
