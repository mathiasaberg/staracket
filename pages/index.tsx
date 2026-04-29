import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'
import { API } from '../lib/api'
import { fmt, fmtTime } from '../lib/format'
import { groupLeagues, isSwedish, getRegion, REGION_ORDER } from '../lib/regions'
import { parseStandings } from '../lib/standings'
import { getFavLeagues, toggleFavLeague, getFavTeams, toggleFavTeam } from '../lib/favorites'
import type { League, Event, ParsedStanding, MatchModalData } from '../lib/types'
import MatchModal from '../components/MatchModal'
import { fetchMatchDetails } from '../lib/apifootball'
import Dashboard from '../components/Dashboard'
import SwedenMap from '../components/SwedenMap'
import TeamSearch from '../components/TeamSearch'
import RaceChart from '../components/RaceChart'
import TodayMatches from '../components/TodayMatches'

const CURRENT_YEAR = 2026
const YEARS = Array.from({ length: CURRENT_YEAR - 1999 }, (_, i) => CURRENT_YEAR - i)

type View = 'resultat' | 'karta' | 'dashboard' | 'sok' | 'nyheter' | 'idag'

type NewsItem = {
  id: string
  title: string
  body: string
  date: string
  image?: string
}

const NEWS_STORAGE_KEY = 'staracket_news'
const AUTH_TOKEN_KEY = 'staracket_auth_token'

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
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null)
  const [authUser, setAuthUser] = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [mapInitDone, setMapInitDone] = useState(false)
  const [teamSchedule, setTeamSchedule] = useState<{ team: { id: number; name: string }; events: Event[] } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const leagueRef = useRef<League | null>(null)

  useEffect(() => {
    setFavLeagueIds(getFavLeagues())
    setFavTeamIds(getFavTeams())
    try {
      const stored = localStorage.getItem(NEWS_STORAGE_KEY)
      if (stored) setNewsItems(JSON.parse(stored))
    } catch {}
    // Verify stored auth token
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (token) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token })
      }).then(r => r.json()).then(d => {
        if (d.username) setAuthUser(d.username)
        else localStorage.removeItem(AUTH_TOKEN_KEY)
      }).catch(() => localStorage.removeItem(AUTH_TOKEN_KEY))
    }
  }, [])

  const loadLeagues = useCallback(async (selectedYear: number) => {
    setLoading(true)
    setSelectedLeague(null)
    leagueRef.current = null
    setRounds([])
    setStandings([])

    try {
      const data = await API('leagues', { sport: 10, limit: 500, season: selectedYear })
      let football: League[] = data.leagues || []
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
      const evData = await API(`events/${baseEvent.id}`)
      const ev = evData?.event || null
      setMatchModal({
        baseEvent, event: ev, facts: [], loading: false, apiLoading: true
      })
      // Fetch API-Football data for 2022-2024 seasons
      const matchYear = baseEvent.startDate ? new Date(baseEvent.startDate).getFullYear() : 0
      if (matchYear >= 2022 && matchYear <= 2024) {
        const leagueName = ev?.league?.name || selectedLeague?.name || ''
        const details = await fetchMatchDetails(
          leagueName,
          baseEvent.homeTeam.name,
          baseEvent.visitingTeam.name,
          baseEvent.startDate
        )
        setMatchModal(prev => prev ? {
          ...prev,
          apiEvents: details?.events || [],
          apiLineups: details?.lineups || [],
          apiLoading: false
        } : null)
      } else {
        setMatchModal(prev => prev ? { ...prev, apiLoading: false } : null)
      }
    } catch {
      setMatchModal({ baseEvent, event: null, facts: [], loading: false })
    }
  }, [selectedLeague])

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

  // Filter sidebar leagues by search and region
  const filteredGroupedLeagues = groupedLeagues.map(g => {
    let filtered = g.leagues
    if (sidebarSearch) {
      const q = sidebarSearch.toLowerCase()
      filtered = filtered.filter(l => l.name.toLowerCase().includes(q))
    }
    if (regionFilter) {
      filtered = filtered.filter(l => {
        const r = getRegion(l.name)
        return r === regionFilter || (regionFilter === 'Favoriter' && favLeagueIds.includes(l.id))
      })
    }
    return { ...g, leagues: filtered }
  }).filter(g => g.leagues.length > 0)

  // Compute form (last 5 match results) per team for standings
  type FormEntry = { result: 'W'|'D'|'L'; event: Event }
  const teamForm = (() => {
    const form: Record<number, FormEntry[]> = {}
    if (!rounds.length || currentRound < 0) return form
    const allEvents: Event[] = []
    for (let i = 0; i <= currentRound; i++) {
      const r = rounds[i]
      const evts = roundMap[r] || []
      allEvents.push(...evts.filter(e => e.status === 'FINISHED'))
    }
    const teamResults: Record<number, FormEntry[]> = {}
    for (const e of allEvents) {
      const hs = e.homeTeamScore ?? 0
      const as = e.visitingTeamScore ?? 0
      const hid = e.homeTeam?.id
      const aid = e.visitingTeam?.id
      if (hid) {
        if (!teamResults[hid]) teamResults[hid] = []
        teamResults[hid].push({ result: hs > as ? 'W' : hs === as ? 'D' : 'L', event: e })
      }
      if (aid) {
        if (!teamResults[aid]) teamResults[aid] = []
        teamResults[aid].push({ result: hs < as ? 'W' : hs === as ? 'D' : 'L', event: e })
      }
    }
    for (const [id, results] of Object.entries(teamResults)) {
      form[Number(id)] = results.slice(-5)
    }
    return form
  })()

  // Auto-filter map on Superettan on first visit
  const nationalLeagues = useMemo(() =>
    (currentLeagues || []).filter(l => /allsvenskan|superettan|damallsvenskan|elitettan|ettan|svenska cupen/i.test(l.name)),
    [currentLeagues]
  )

  useEffect(() => {
    if (view === 'karta' && !mapInitDone && currentLeagues?.length) {
      const superettan = currentLeagues.find(l => /superettan/i.test(l.name))
      if (superettan) {
        setMapLeagueIds([superettan.id])
      }
      setMapInitDone(true)
    }
  }, [view, mapInitDone, currentLeagues])

  return (
    <>
      <Head>
        <title>ståräcket</title>
        <meta name="description" content="Svensk fotboll – tabeller och resultat" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <header className={styles.header}>
        <button className={styles.hamburger} onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
        <div className={styles.logoWrap} onClick={() => setView('resultat')} style={{cursor:'pointer'}}>
          <div className={styles.logo}>
            stå<span>räcket</span>
          </div>
          <div className={styles.logoSub}>Ditt stöd i fotbollssverige</div>
        </div>
        <nav className={styles.topNav}>
          <button className={`${styles.topNavBtn} ${view==='resultat' ? styles.topNavActive : ''}`} onClick={() => setView('resultat')}>Serier</button>
          <button className={`${styles.topNavBtn} ${view==='dashboard' ? styles.topNavActive : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
          <button className={`${styles.topNavBtn} ${view==='karta' ? styles.topNavActive : ''}`} onClick={() => setView('karta')}>Karta</button>
          <button className={`${styles.topNavBtn} ${view==='sok' ? styles.topNavActive : ''}`} onClick={() => setView('sok')}>Sök</button>
          <button className={`${styles.topNavBtn} ${view==='nyheter' ? styles.topNavActive : ''}`} onClick={() => setView('nyheter')}>Nyheter</button>
          <button className={`${styles.topNavBtn} ${view==='idag' ? styles.topNavActive : ''}`} onClick={() => setView('idag')}>Idag</button>
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
          <nav className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
            <button className={styles.sidebarClose} onClick={() => setSidebarOpen(false)}>{"\u2715"}</button>
            {loading ? (
              <div className={styles.loading}>Laddar...</div>
            ) : (
              <>
                <div className={styles.sidebarSearch}>
                  <input
                    className={styles.sidebarSearchInput}
                    placeholder="Sök serie..."
                    value={sidebarSearch}
                    onChange={e => setSidebarSearch(e.target.value)}
                  />
                </div>
                <div className={styles.sidebarFilter}>
                  <select
                    className={styles.sidebarFilterSelect}
                    value={regionFilter}
                    onChange={e => setRegionFilter(e.target.value)}
                  >
                    <option value="">Alla kategorier</option>
                    {REGION_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {filteredGroupedLeagues.length === 0 ? (
                  <div className={styles.emptyMsg}>Inga serier matchar</div>
                ) : (
                  filteredGroupedLeagues.map((group, gi) => (
                    <div key={group.region} className={styles.sidebarGroup}>
                      <div className={`${styles.sidebarGroupLabel} ${gi === 0 && !sidebarSearch && !regionFilter ? styles.sidebarGroupFirst : ''} ${group.region === 'Internationellt' ? styles.sidebarGroupForeign : ''} ${group.region === 'Favoriter' ? styles.sidebarGroupFav : ''}`}>
                        {group.region}
                      </div>
                      {group.leagues.map(l => (
                        <div
                          key={l.id}
                          className={`${styles.leagueItem} ${selectedLeague?.id === l.id ? styles.active : ''} ${!isSwedish(l.name) ? styles.leagueItemForeign : ''}`}
                          onClick={() => { selectLeague(l); setSidebarOpen(false) }}
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
              </>
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
                    <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>#</th><th>Lag</th>
                          <th className={styles.r}>M</th><th className={styles.r}>V</th>
                          <th className={styles.r}>O</th><th className={styles.r}>F</th>
                          <th className={`${styles.r} ${styles.hideMobile}`}>GM</th><th className={`${styles.r} ${styles.hideMobile}`}>IM</th>
                          <th className={`${styles.r} ${styles.hideMobile}`}>+/-</th><th className={styles.r}>P</th>
                          <th className={styles.r}>Form</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((t, i) => (
                          <tr key={t.team?.id || i} data-zone={t.zone}>
                            <td className={`${styles.r} ${styles.muted}`}>{t.position}</td>
                            <td className={`${styles.teamName} ${styles.teamNameClickable}`} onClick={() => {
                              const allEvts: Event[] = []
                              for (const evts of Object.values(roundMap)) allEvts.push(...evts)
                              const teamEvts = allEvts.filter(e => e.homeTeam?.id === t.team.id || e.visitingTeam?.id === t.team.id)
                                .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
                              setTeamSchedule({ team: t.team, events: teamEvts })
                            }}>
                              {t.team?.logo && <img src={t.team.logo} alt="" className={styles.teamLogo} />}
                              {t.team?.name || '—'}
                            </td>
                            <td className={styles.r}>{t.gp}</td>
                            <td className={styles.r}>{t.w}</td>
                            <td className={styles.r}>{t.d}</td>
                            <td className={styles.r}>{t.l}</td>
                            <td className={`${styles.r} ${styles.hideMobile}`}>{t.gf}</td>
                            <td className={`${styles.r} ${styles.hideMobile}`}>{t.ga}</td>
                            <td className={`${styles.r} ${styles.hideMobile}`}>{t.gd > 0 ? '+' + t.gd : t.gd}</td>
                            <td className={`${styles.r} ${styles.pts}`}>{t.pts}</td>
                            <td>
                              <div className={styles.formCell}>
                                {(teamForm[t.team.id] || []).map((f, ri) => (
                                  <span key={ri} className={`${styles.formDot} ${f.result === 'W' ? styles.formWin : f.result === 'D' ? styles.formDraw : styles.formLoss}`}
                                    title={`${f.event.homeTeam?.name} ${f.event.homeTeamScore}–${f.event.visitingTeamScore} ${f.event.visitingTeam?.name}`}
                                  >
                                    {f.result === 'W' ? 'V' : f.result === 'D' ? 'O' : 'F'}
                                  </span>
                                ))}
                              </div>
                            </td>
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
                    </div>
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
                          {(e.homeTeam as any)?.arena?.name && (
                            <div className={styles.matchMeta}>{(e.homeTeam as any).arena.name}</div>
                          )}
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
                <div className={styles.poweredBy}>Powered by <a href="https://www.everysport.com" target="_blank" rel="noopener noreferrer">EverySport</a></div>
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
          <nav className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
            <button className={styles.sidebarClose} onClick={() => setSidebarOpen(false)}>{"\u2715"}</button>
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
                {nationalLeagues.map(l => (
                  <div
                    key={l.id}
                    className={`${styles.leagueItem} ${mapLeagueIds.includes(l.id) ? styles.active : ''}`}
                    onClick={() => toggleMapLeague(l.id)}
                  >
                    <span className={styles.leagueItemName}>{l.name}</span>
                  </div>
                ))}
              </>
            )}
          </nav>
          <main className={styles.main}>
            <SwedenMap allLeagues={nationalLeagues} selectedLeagueIds={mapLeagueIds} onGoToLeague={selectLeague} />
          </main>
        </div>
      )}

      {/* ── Search view ── */}
      {view === 'sok' && (
        <div className={styles.pageContent}>
          <TeamSearch allLeagues={allLeagues} onGoToLeague={selectLeague} />
        </div>
      )}

      {/* ── News/CMS view ── */}
      {view === 'nyheter' && (
        <div className={styles.pageContent}>
          <div className={styles.newsContainer}>
            <div className={styles.newsHeader}>
              <h2 className={styles.dashboardTitle}>Nyheter</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {authUser ? (
                  <>
                    <button className={styles.racePlayBtn} onClick={() => setEditingNews({ id: '', title: '', body: '', date: new Date().toISOString().slice(0, 10) })}>
                      + Ny artikel
                    </button>
                    <button className={styles.teamInfoLink} onClick={() => {
                      setAuthUser(null)
                      localStorage.removeItem(AUTH_TOKEN_KEY)
                    }}>Logga ut ({authUser})</button>
                  </>
                ) : (
                  <button className={styles.teamInfoLink} onClick={() => { setShowLogin(true); setLoginError('') }}>Logga in</button>
                )}
              </div>
            </div>

            {showLogin && !authUser && (
              <div className={styles.newsEditor}>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  const form = e.currentTarget
                  const fd = new FormData(form)
                  const username = fd.get('username') as string
                  const password = fd.get('password') as string
                  try {
                    const r = await fetch('/api/auth', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'login', username, password })
                    })
                    const data = await r.json()
                    if (r.ok && data.token) {
                      localStorage.setItem(AUTH_TOKEN_KEY, data.token)
                      setAuthUser(data.username)
                      setShowLogin(false)
                      setLoginError('')
                    } else {
                      setLoginError(data.error || 'Inloggning misslyckades')
                    }
                  } catch {
                    setLoginError('Kunde inte ansluta till servern')
                  }
                }}>
                  <input className={styles.searchInput} name="username" placeholder="Användarnamn" autoComplete="username" required />
                  <input className={styles.searchInput} name="password" type="password" placeholder="Lösenord" autoComplete="current-password" required style={{ marginTop: 8 }} />
                  {loginError && <div style={{ color: 'var(--rust)', fontSize: 13, marginTop: 4 }}>{loginError}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="submit" className={styles.racePlayBtn}>Logga in</button>
                    <button type="button" className={styles.racePlayBtn} style={{ background: 'var(--steel-dark)' }} onClick={() => setShowLogin(false)}>Avbryt</button>
                  </div>
                </form>
              </div>
            )}

            {editingNews && authUser && (
              <div className={styles.newsEditor}>
                <input
                  className={styles.searchInput}
                  placeholder="Rubrik"
                  value={editingNews.title}
                  onChange={e => setEditingNews({ ...editingNews, title: e.target.value })}
                />
                <textarea
                  className={styles.newsTextarea}
                  placeholder="Brödtext..."
                  rows={6}
                  value={editingNews.body}
                  onChange={e => setEditingNews({ ...editingNews, body: e.target.value })}
                />
                {editingNews.image && (
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <img src={editingNews.image} alt="Förhandsvisning" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: '1px solid var(--border)' }} />
                    <button
                      className={styles.modalClose}
                      style={{ position: 'absolute', top: 4, right: 4 }}
                      onClick={() => setEditingNews({ ...editingNews, image: undefined })}
                    >Ta bort bild</button>
                  </div>
                )}
                <label className={styles.teamInfoLink} style={{ display: 'inline-block', cursor: 'pointer', textAlign: 'center' }}>
                  Lägg till bild
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 2 * 1024 * 1024) { alert('Max 2 MB'); return }
                    const reader = new FileReader()
                    reader.onload = () => setEditingNews(prev => prev ? { ...prev, image: reader.result as string } : prev)
                    reader.readAsDataURL(file)
                  }} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={styles.racePlayBtn} onClick={() => {
                    const item: NewsItem = {
                      ...editingNews,
                      id: editingNews.id || Date.now().toString(),
                      date: editingNews.date || new Date().toISOString().slice(0, 10)
                    }
                    const updated = editingNews.id
                      ? newsItems.map(n => n.id === item.id ? item : n)
                      : [item, ...newsItems]
                    setNewsItems(updated)
                    localStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify(updated))
                    setEditingNews(null)
                  }}>Publicera</button>
                  <button className={styles.racePlayBtn} style={{ background: 'var(--steel-dark)' }} onClick={() => setEditingNews(null)}>Avbryt</button>
                </div>
              </div>
            )}

            {newsItems.length === 0 && !editingNews && !showLogin && (
              <div className={styles.modalEmpty}>Inga nyheter publicerade ännu</div>
            )}

            {newsItems.map(n => (
              <div key={n.id} className={styles.newsCard}>
                <div className={styles.newsDate}>{n.date}</div>
                <h3 className={styles.newsTitle}>{n.title}</h3>
                {n.image && (
                  <img src={n.image} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 6, marginBottom: '0.75rem' }} />
                )}
                <p className={styles.newsBody}>{n.body}</p>
                {authUser && (
                  <div className={styles.newsActions}>
                    <button className={styles.teamInfoLink} onClick={() => setEditingNews(n)}>Redigera</button>
                    <button className={styles.teamInfoLink} style={{ color: 'var(--rust)' }} onClick={() => {
                      const updated = newsItems.filter(x => x.id !== n.id)
                      setNewsItems(updated)
                      localStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify(updated))
                    }}>Ta bort</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'idag' && (
        <div className={styles.pageContent}>
          <div className={styles.centeredContent}>
            <h2 className={styles.dashboardTitle}>Matcher idag</h2>
            <TodayMatches allLeagues={allLeagues} nationalLeagues={nationalLeagues} favLeagueIds={favLeagueIds} favTeamIds={favTeamIds} onOpenMatch={openMatch} />
          </div>
        </div>
      )}

      {matchModal && <MatchModal modal={matchModal} onClose={() => setMatchModal(null)} />}
      {teamSchedule && (
        <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setTeamSchedule(null) }}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <button className={styles.modalClose} onClick={() => setTeamSchedule(null)}>{'\u2715 St\u00e4ng'}</button>
              <div className={styles.modalLeagueName}>{selectedLeague?.name}</div>
              <div style={{fontFamily:'Barlow Condensed, sans-serif', fontSize: 22, fontWeight: 700}}>
                {teamSchedule.team.name}
              </div>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.factsTitle}>Spelschema</div>
              {teamSchedule.events.map(e => {
                const done = e.status === 'FINISHED'
                const isHome = e.homeTeam?.id === teamSchedule.team.id
                return (
                  <div key={e.id} className={styles.matchInfoRow} style={{cursor: 'pointer'}} onClick={() => { setTeamSchedule(null); openMatch(e) }}>
                    <span className={styles.matchInfoLabel}>Omg {e.round}</span>
                    <span style={{flex:1}}>
                      {isHome ? e.visitingTeam?.name : e.homeTeam?.name}
                      {isHome ? ' (H)' : ' (B)'}
                    </span>
                    <span style={{fontWeight: 600, fontFamily:'Barlow Condensed, sans-serif'}}>
                      {done ? `${e.homeTeamScore}\u2013${e.visitingTeamScore}` : e.startDate ? `${fmt(e.startDate)} ${fmtTime(e.startDate)}` : '\u2013'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {showRace && selectedLeague && rounds.length > 1 && (
        <RaceChart league={selectedLeague} rounds={rounds} onClose={() => setShowRace(false)} favTeamIds={favTeamIds} />
      )}
    </>
  )
}
