import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { API } from '../lib/api'
import { parseStandings } from '../lib/standings'
import type { League, ParsedStanding } from '../lib/types'
import styles from '../styles/Home.module.css'
import LoadingSpinner from './LoadingSpinner'

type Props = {
  league: League
  rounds: number[]
  onClose: () => void
  favTeamIds?: number[]
}

const BAR_COLORS = [
  '#c0392b','#2a7a3b','#2980b9','#e6a817','#8e44ad',
  '#d35400','#16a085','#c0392b','#2c3e50','#27ae60',
  '#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c',
  '#e67e22',
]

const ROW_HEIGHT = 30 // px per row

export default function RaceChart({ league, rounds, onClose, favTeamIds = [] }: Props) {
  const [allStandings, setAllStandings] = useState<Map<number, ParsedStanding[]>>(new Map())
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loadProgress, setLoadProgress] = useState(0)

  // Load all rounds in parallel batches
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadProgress(0)
      const map = new Map<number, ParsedStanding[]>()
      const batchSize = 5
      let loaded = 0
      for (let i = 0; i < rounds.length; i += batchSize) {
        if (cancelled) return
        const batch = rounds.slice(i, i + batchSize)
        const results = await Promise.allSettled(
          batch.map(r => API(`leagues/${league.id}/standings`, { round: r }).then(data => ({ r, data })))
        )
        for (const result of results) {
          if (result.status === 'fulfilled') {
            map.set(result.value.r, parseStandings(result.value.data))
          }
        }
        loaded += batch.length
        if (!cancelled) setLoadProgress(Math.round((loaded / rounds.length) * 100))
      }
      if (!cancelled) {
        const firstRound = map.get(rounds[0])
        if (firstRound) {
          const zeroRound = firstRound.map(s => ({
            ...s, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0
          }))
          map.set(0, zeroRound)
        }
        setAllStandings(map)
        setCurrentIdx(0)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [league.id, rounds])

  const displayRounds = useMemo(() => [0, ...rounds], [rounds])

  useEffect(() => {
    if (!playing) return
    if (currentIdx >= displayRounds.length - 1) { setPlaying(false); return }
    timerRef.current = setTimeout(() => setCurrentIdx(i => i + 1), 1200)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [playing, currentIdx, displayRounds.length])

  const standings = allStandings.get(displayRounds[currentIdx]) || []
  const sorted = [...standings].sort((a, b) => b.pts - a.pts || (b.gd - a.gd) || (b.gf - a.gf))
  const maxPts = Math.max(1, ...sorted.map(s => s.pts))

  // Build position map: teamId -> sorted index
  const posMap = useMemo(() => {
    const m = new Map<number, number>()
    sorted.forEach((s, i) => m.set(s.team.id, i))
    return m
  }, [sorted])

  // Stable team order: always render in the same order (first round order)
  // but translate each row to its current sorted position
  const stableOrder = useMemo(() => {
    const first = allStandings.get(rounds[0]) || allStandings.get(0) || []
    return first.map(s => s.team.id)
  }, [allStandings, rounds])

  const teamColors = useMemo(() => {
    const firstStandings = allStandings.get(rounds[0]) || []
    const map = new Map<number, string>()
    firstStandings.forEach((s, i) => map.set(s.team.id, BAR_COLORS[i % BAR_COLORS.length]))
    return map
  }, [allStandings, rounds])

  // Create a lookup for current standings data by team id
  const standingsMap = useMemo(() => {
    const m = new Map<number, ParsedStanding>()
    sorted.forEach(s => m.set(s.team.id, s))
    return m
  }, [sorted])

  const play = () => { setCurrentIdx(0); setPlaying(true) }
  const pause = () => setPlaying(false)
  const resume = () => setPlaying(true)

  const totalHeight = stableOrder.length * ROW_HEIGHT

  return (
    <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.raceChartCard}>
        <div className={styles.raceChartHeader}>
          <span className={styles.raceChartTitle}>{league.name} – Serierace</span>
          <button className={styles.modalClose} onClick={onClose}>{'✕'} Stäng</button>
        </div>
        <div className={styles.raceChartBody}>
          {loading ? (
            <LoadingSpinner message={`Laddar ställningar\u2026 ${loadProgress}%`} />
          ) : (
            <>
              <div className={styles.raceControls}>
                {!playing ? (
                  <button className={styles.racePlayBtn} onClick={currentIdx >= displayRounds.length - 1 ? play : (currentIdx === 0 ? play : resume)}>
                    {currentIdx >= displayRounds.length - 1 ? '▶ Spela om' : (currentIdx === 0 ? '▶ Starta' : '▶ Fortsätt')}
                  </button>
                ) : (
                  <button className={styles.racePlayBtn} onClick={pause}>{'⏸'} Pausa</button>
                )}
                {currentIdx > 0 && !playing && (
                  <button className={styles.racePlayBtn} style={{background:'var(--steel-dark)'}} onClick={() => setCurrentIdx(0)}>{'⏮'} Omgång 1</button>
                )}
                <span className={styles.raceRoundLabel}>
                  {displayRounds[currentIdx] === 0 ? 'Start' : `Omgång ${displayRounds[currentIdx]}`} / {rounds[rounds.length - 1]}
                </span>
              </div>
              <div className={styles.raceBars} style={{ position: 'relative', height: totalHeight }}>
                {stableOrder.map(teamId => {
                  const s = standingsMap.get(teamId)
                  if (!s) return null
                  const pos = posMap.get(teamId) ?? 0
                  const isFav = favTeamIds.includes(teamId)
                  return (
                    <div
                      key={teamId}
                      className={styles.raceBarRow}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        transform: `translateY(${pos * ROW_HEIGHT}px)`,
                        transition: 'transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
                        height: ROW_HEIGHT,
                      }}
                    >
                      <div className={styles.raceBarLabel} style={isFav ? { color: 'var(--gold)', fontWeight: 700 } : undefined}>
                        {isFav ? '★ ' : ''}{s.team.name}
                      </div>
                      <div className={styles.raceBarTrack}>
                        <div
                          className={styles.raceBar}
                          style={{
                            width: `${(s.pts / maxPts) * 100}%`,
                            backgroundColor: isFav ? 'var(--gold)' : (teamColors.get(teamId) || '#888'),
                            boxShadow: isFav ? '0 0 8px var(--gold)' : undefined,
                          }}
                        />
                        <span className={styles.raceBarPts}>{s.pts}p</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
