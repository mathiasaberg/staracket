import { useEffect, useState, useCallback, useRef } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'
import { API } from '../lib/api'
import { fmt, fmtTime } from '../lib/format'
import { groupLeagues, isSwedish } from '../lib/regions'
import { parseStandings } from '../lib/standings'
import { getFavLeagues, toggleFavLeague, getFavTeams, toggleFavTeam } from '../lib/favorites'
import type { League, Event, ParsedStanding, MatchModalData } from '../lib/types'
import MatchModal from '../components/MatchModal'
import Dashboard from '../components/Dashboard'
import SwedenMap from '../components/SwedenMap'
import TeamSearch from '../components/TeamSearch'
import RaceChart from '../components/RaceChart'

const CURRENT_YEAR = 2026
const YEARS = [2026, 2025, 2024, 2023, 2022]

type View = 'resultat' | 'karta' | 'dashboard' | 'sok'

export default function Home() {
  const [view, setView] = useState<View>('resultat')
  const [gender, setGender] = useState<'herr' | 'dam'>('herr')
  const [year, setYear] = useState<number>(CURRENT_YEAR)
  const [leagues, setLeagues] = useState<{ herr: League[]; dam: League[] }>({ herr: [], dam: [] })
  const [allLeagues, setAllLeagues] = useState<League[]>([])
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null)
  const [rounds, setRounds] = useState<number[]>([])
  const [roundMap, setRoundMap] = useState<Record<number, Event[]>>({})
  const [currentRound, setCurrentRound] = useState(0)
  const [standings, setStandings] = useState<ParsedStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMain, setLoadingMain] = useState(false)
  const [matchModal, setMatchModal] = useState<MatchModalData | null>(null)
  const [showRace, setShowRace] = useState(false)
  const [favLeagueIds, setFavLeagueIds] = useState<number[]>([])
  const [favTeamIds, setFavTeamIds] = useState<number[]>([])
  const [mapLeagueIds, setMapLeagueIds] = useState<number[]>([])
  const leagueRef = useRef<League | null>(null)

  useEffect(() => {
    setFavLeagueIds(getFavLeagues())
    setFavTeamIds(getFavTeams())
  }, [])

  const loadLeagues = useCallback(async (selectedYear: number) => {
    setLoading(true)
    setSelectedLeague(null)
    leagueRef.current = null
    setRounds([])
    setStandings([])

    try {
      const data = await API('leagues', { sport: 10, limit: 500 })
      const all: League[] = data.leagues || []
      let football = all.filter(l =>
        Number(l.season?.startYear) === selectedYear || Number(l.season?.endYear) === selectedYear
      )
      // Fallback: if very few Swedish leagues found, try without strict year filter
      if (football.filter(l => /allsvenskan|superettan|division|ettan/i.test(l.name)).length === 0) {
        football = all
      }
      const dam = football.filter(l =>
        l.teamClassId === 2 ||
        /\bdam(allsvenskan|ettan|)?\b/i.test(l.name) ||
        /\belitettan\b/i.test(l.name) ||
        /^F\d{2}\b/i.test(l.name) ||
        l.teamClass?.toLowerCase() === 'dam'
      )
      const damIds = new Set(dam.map(l => l.id))
      const herr = football.filter(l => !damIds.has(l.id))
      setLeagues({ herr, dam })
      setAllLeagues(football)
      setLoading(false)
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLeagues(year) }, [year, loadLeagues])

  useEffect(() => {
    if (view !== 'resultat') return
    const list = leagues[gender]
    if (list?.length) selectLeague(list[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues, gender])

  const fetchStandings = useCallback(async (leagueId: number, round: number): Promise<ParsedStanding[]> => {
    try {
      const sdData = await API(`leagues/${leagueId}/standings`, { round })
      return parseStandings(sdData)
    } catch {
      try {
        const sdData = await API(`leagues/${leagueId}/standings`)
        return parseStandings(sdData)
      } catch { return [] }
    }
  }, [])

  const selectLeague = useCallback(async (league: League) => {
    setView('resultat')
    setSelectedLeague(league)
    leagueRef.current = league
    setLoadingMain(true)
    setStandings([])
    setRounds([])
    setRoundMap({})
    setMatchModal(null)
    setShowRace(false)

    try {
      const evData = await API('events', { league: league.id, limit: 500 })
      const events: Event[] = evData.events || []
      const rm: Record<number, Event[]> = {}
      events.forEach(e => {
        const r = e.round ?? 0
        if (!rm[r]) rm[r] = []
        rm[r].push(e)
      })
      const rs = Object.keys(rm).map(Number).sort((a, b) => a - b)
      const finished = events.filter(e => e.status === 'FINISHED')
      const latestR = finished.length ? Math.max(...finished.map(e => e.round ?? 0)) : rs[0]
      const idx = Math.max(0, rs.indexOf(latestR))
      setRoundMap(rm)
      setRounds(rs)
      setCurrentRound(idx)
      const roundNum = rs[idx]
      if (roundNum != null) {
        const st = await fetchStandings(league.id, roundNum)
        setStandings(st)
      }
    } catch (e) { console.error(e) }
    finally { setLoadingMain(false) }
  }, [fetchStandings])

  const changeRound = useCallback(async (dir: number) => {
    const next = currentRound + dir
    if (next < 0 || next >= rounds.length) return
    setCurrentRound(next)
    const roundNum = rounds[next]
    const league = leagueRef.current
    if (league && roundNum != null) {
      const st = await fetchStandings(league.id, roundNum)
      setStandings(st)
    }
  }, [currentRound, rounds, fetchStandings])

  const openMatch = useCallback(async (baseEvent: Event) => {
    setMatchModal({ baseEvent, event: null, facts: [], loading: true })
    try {
      const [evRes, factsRes] = await Promise.allSettled([
        API(`events/${baseEvent.id}`),
        API(`events/${baseEvent.id}/facts`)
      ])
      const evData = evRes.status === 'fulfilled' ? evRes.value : {}
      const factsData = factsRes.status === 'fulfilled' ? factsRes.value : {}
      setMatchModal({
        baseEvent,
        event: evData?.event || null,
        facts: factsData?.facts || [],
        loading: false
      })
    } catch {
      setMatchModal({ baseEvent, event: null, facts: [], loading: false })
    }
  }, [])

  const handleToggleFavLeague = (id: number) => {
    const next = toggleFavLeague(id)
    setFavLeagueIds(next)
  }
  const handleToggleFavTeam = (id: number) => {
    const next = toggleFavTeam(id)
    setFavTeamIds(next)
  }
  const toggleMapLeague = (id: number) => {
    setMapLeagueIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const events = roundMap[rounds[currentRound]] || []
  const round = rounds[currentRound]
  const dates = events.map(e => e.startDate).filter(Boolean)
  const dateRange = dates.length
    ? dates[0].slice(0,10) === dates[dates.length-1].slice(0,10)
      ? fmt(dates[0])
      : `${fmt(dates[0])} – ${fmt(dates[dates.length-1])}`
    : ''
  const currentLeagues = leagues[gender]
  const groupedLeagues = groupLeagues(currentLeagues || [], favLeagueIds)

  return (
    <>
      <Head>
        <title>ståräcket</title>
        <meta name="description" content="Svensk fotboll – tabeller och resultat" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <header className={styles.header}>
        <div className={styles.logo} onClick={() => setView('resultat')} style={{cursor:'pointer'}}>
          stå<span>räcket</span>
        </div>
        <nav className={styles.topNav}>
          <button className={`${styles.topNavBtn} ${view==='resultat' ? styles.topNavActive : ''}`} onClick={() => setView('resultat')}>Serier</button>
          <button className={`${styles.topNavBtn} ${view==='dashboard' ? styles.topNavActive : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
          <button className={`${styles.topNavBtn} ${view==='karta' ? styles.topNavActive : ''}`} onClick={() => setView('karta')}>Karta</button>
          <button className={`${styles.topNavBtn} ${view==='sok' ? styles.topNavActive : ''}`} onClick={() => setView('sok')}>Sök</button>
        </nav>
        <div className={styles.headerRight}>
          <select className={styles.yearSelect} value={year} onChange={e => setYear(Number(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className={styles.genderTabs}>
            <button className={`${styles.genderBtn} ${gender==='herr' ? styles.active : ''}`} onClick={() => setGender('herr')}>Herr</button>
            <button className={`${styles.genderBtn} ${gender==='dam'  ? styles.active : ''}`} onClick={() => setGender('dam')}>Dam</button>
          </div>
        </div>
      </header>

      {/* ── "Serier" view ── */}
      {view === 'resultat' && (
        <div className={styles.app}>
          <nav className={styles.sidebar}>
            {loading ? (
              <div className={styles.loading}>Laddar...</div>
            ) : groupedLeagues.length === 0 ? (
              <div className={styles.emptyMsg}>Inga divisioner hittades</div>
            ) : (
              groupedLeagues.map((group, gi) => (
                <div key={group.region} className={styles.sidebarGroup}>
                  <div className={`${styles.sidebarGroupLabel} ${gi === 0 ? styles.sidebarGroupFirst : ''} ${group.region === 'Internationellt' ? styles.sidebarGroupForeign : ''} ${group.region === 'Favoriter' ? styles.sidebarGroupFav : ''}`}>
                    {group.region}
                  </div>
                  {group.leagues.map(l => (
                    <div
                      key={l.id}
                      className={`${styles.leagueItem} ${selectedLeague?.id === l.id ? styles.active : ''} ${!isSwedish(l.name) ? styles.leagueItemForeign : ''}`}
                      onClick={() => selectLeague(l)}
                      title={l.name}
                    >
                      <span className={styles.leagueItemName}>{l.name}</span>
                      <button
                        className={`${styles.favStar} ${favLeagueIds.includes(l.id) ? styles.favStarActive : ''}`}
                        onClick={e => { e.stopPropagation(); handleToggleFavLeague(l.id) }}
                        title="Favorit"
                      >
                        {favLeagueIds.includes(l.id) ? '★' : '☆'}
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </nav>

          <main className={styles.main}>
            {loadingMain ? (
              <div className={styles.loading}>Laddar...</div>
            ) : !selectedLeague ? (
              <div className={styles.loading}>Välj en division</div>
            ) : rounds.length === 0 ? (
              <div className={styles.loading}>Inga matcher för {year}</div>
            ) : (
              <>
                <div className={styles.roundNav}>
                  <button className={styles.roundBtn} onClick={() => changeRound(-1)} disabled={currentRound===0}>{'←'}</button>
                  <div className={styles.roundLabel}>
                    {round === 0 ? 'Okänd omgång' : `Omgång ${round}`}
                    <span className={styles.roundSub}>{dateRange}</span>
                  </div>
                  <button className={styles.roundBtn} onClick={() => changeRound(1)} disabled={currentRound===rounds.length-1}>{'→'}</button>
                  <span className={styles.roundCounter}>{currentRound+1} / {rounds.length}</span>
                  <button className={styles.raceBtn} onClick={() => setShowRace(true)} title="Serierace-animation">
                    {'▶'} Race
                  </button>
                </div>

                <div className={styles.rail} />

                {standings.length > 0 && (
                  <>
                    <div className={styles.sectionTitle}>Tabell efter omgång {round}</div>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>#</th><th>Lag</th>
                          <th className={styles.r}>M</th><th className={styles.r}>V</th>
                          <th className={styles.r}>O</th><th className={styles.r}>F</th>
                          <th className={styles.r}>GM</th><th className={styles.r}>IM</th>
                          <th className={styles.r}>+/-</th><th className={styles.r}>P</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((t, i) => (
                          <tr key={t.team?.id || i} data-zone={t.zone}>
                            <td className={`${styles.r} ${styles.muted}`}>{t.position}</td>
                            <td className={styles.teamName}>
                              {t.team?.logo && <img src={t.team.logo} alt="" className={styles.teamLogo} />}
                              {t.team?.name || '—'}
                            </td>
                            <td className={styles.r}>{t.gp}</td>
                            <td className={styles.r}>{t.w}</td>
                            <td className={styles.r}>{t.d}</td>
                            <td className={styles.r}>{t.l}</td>
                            <td className={styles.r}>{t.gf}</td>
                            <td className={styles.r}>{t.ga}</td>
                            <td className={styles.r}>{t.gd > 0 ? '+' + t.gd : t.gd}</td>
                            <td className={`${styles.r} ${styles.pts}`}>{t.pts}</td>
                            <td>
                              <button
                                className={`${styles.favStar} ${styles.favStarSmall} ${favTeamIds.includes(t.team.id) ? styles.favStarActive : ''}`}
                                onClick={() => handleToggleFavTeam(t.team.id)}
                                title="Favorit"
                              >
                                {favTeamIds.includes(t.team.id) ? '★' : '☆'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                <div className={styles.sectionTitle}>Omgångens matcher</div>
                {events.length === 0 ? (
                  <div className={styles.muted} style={{fontSize:14,padding:'0.5rem 0'}}>Inga matcher denna omgång</div>
                ) : (
                  <div className={styles.matchesGrid}>
                    {events.map(e => {
                      const done = e.status === 'FINISHED'
                      const score = done
                        ? `${e.homeTeamScore ?? ''}–${e.visitingTeamScore ?? ''}`
                        : e.startDate ? `${fmt(e.startDate)} ${fmtTime(e.startDate)}` : '—'
                      const isSelected = matchModal?.baseEvent.id === e.id
                      return (
                        <div
                          key={e.id}
                          className={`${styles.matchCard} ${isSelected ? styles.matchCardActive : ''}`}
                          onClick={() => openMatch(e)}
                          title="Klicka för matchdetaljer"
                        >
                          <div className={styles.matchHome}>
                            {e.homeTeam?.logo && <img src={e.homeTeam.logo} alt="" className={styles.teamLogo} />}
                            {e.homeTeam?.name || '—'}
                          </div>
                          <div className={`${styles.matchScore} ${done ? '' : styles.upcoming}`}>{score}</div>
                          <div className={styles.matchAway}>
                            {e.visitingTeam?.logo && <img src={e.visitingTeam.logo} alt="" className={styles.teamLogo} />}
                            {e.visitingTeam?.name || '—'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className={styles.legend}>
                  <span style={{borderColor:'var(--grass)'}}>Uppflyttning</span>
                  <span style={{borderColor:'#e6a817'}}>Kval</span>
                  <span style={{borderColor:'var(--rust)'}}>Nedflyttning</span>
                </div>
              </>
            )}
          </main>
        </div>
      )}

      {/* ── Dashboard view ── */}
      {view === 'dashboard' && (
        <div className={styles.pageContent}>
          <Dashboard allLeagues={allLeagues} onGoToLeague={selectLeague} onOpenMatch={openMatch} />
        </div>
      )}

      {/* ── Map view ── */}
      {view === 'karta' && (
        <div className={styles.app}>
          <nav className={styles.sidebar}>
            {loading ? (
              <div className={styles.loading}>Laddar...</div>
            ) : (
              <>
                <div className={`${styles.sidebarGroupLabel} ${styles.sidebarGroupFirst}`}>
                  Filtrera på karta
                </div>
                {mapLeagueIds.length > 0 && (
                  <div className={styles.leagueItem} onClick={() => setMapLeagueIds([])}>
                    <span className={styles.leagueItemName} style={{color:'var(--rust)'}}>✕ Rensa filter ({mapLeagueIds.length})</span>
                  </div>
                )}
                {groupedLeagues.filter(g => g.region !== 'Favoriter').map((group) => (
                  <div key={'map-' + group.region} className={styles.sidebarGroup}>
                    <div className={`${styles.sidebarGroupLabel} ${group.region === 'Internationellt' ? styles.sidebarGroupForeign : ''}`}>
                      {group.region}
                    </div>
                    {group.leagues.map(l => (
                      <div
                        key={l.id}
                        className={`${styles.leagueItem} ${mapLeagueIds.includes(l.id) ? styles.active : ''}`}
                        onClick={() => toggleMapLeague(l.id)}
                      >
                        <span className={styles.leagueItemName}>{l.name}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </nav>
          <main className={styles.main}>
            <SwedenMap allLeagues={currentLeagues} selectedLeagueIds={mapLeagueIds} onGoToLeague={selectLeague} />
          </main>
        </div>
      )}

      {/* ── Search view ── */}
      {view === 'sok' && (
        <div className={styles.pageContent}>
          <TeamSearch allLeagues={allLeagues} onGoToLeague={selectLeague} />
        </div>
      )}

      {matchModal && <MatchModal modal={matchModal} onClose={() => setMatchModal(null)} />}
      {showRace && selectedLeague && rounds.length > 1 && (
        <RaceChart league={selectedLeague} rounds={rounds} onClose={() => setShowRace(false)} />
      )}
    </>
  )
}
