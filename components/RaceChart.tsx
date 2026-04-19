import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { API } from '../lib/api'
import { parseStandings } from '../lib/standings'
import type { League, ParsedStanding } from '../lib/types'
import styles from '../styles/Home.module.css'

type Props = {
  league: League
  rounds: number[]
  onClose: () => void
}

const BAR_COLORS = [
  '#c0392b','#2a7a3b','#2980b9','#e6a817','#8e44ad',
  '#d35400','#16a085','#c0392b','#2c3e50','#27ae60',
  '#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c',
  '#e67e22',
]

export default function RaceChart({ league, rounds, onClose }: Props) {
  const [allStandings, setAllStandings] = useState<Map<number, ParsedStanding[]>>(new Map())
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load all rounds' standings
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const map = new Map<number, ParsedStanding[]>()
      for (const r of rounds) {
        if (cancelled) return
        try {
          const data = await API(`leagues/${league.id}/standings`, { round: r })
          map.set(r, parseStandings(data))
        } catch { /* skip */ }
      }
      if (!cancelled) {
        setAllStandings(map)
        setCurrentIdx(0)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [league.id, rounds])

  // Playback
  useEffect(() => {
    if (!playing) return
    if (currentIdx >= rounds.length - 1) { setPlaying(false); return }
    timerRef.current = setTimeout(() => setCurrentIdx(i => i + 1), 1200)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [playing, currentIdx, rounds.length])

  const standings = allStandings.get(rounds[currentIdx]) || []
  const maxPts = Math.max(1, ...standings.map(s => s.pts))

  // Stable color assignment by team id
  const teamColors = useMemo(() => {
    const firstStandings = allStandings.get(rounds[0]) || []
    const map = new Map<number, string>()
    firstStandings.forEach((s, i) => map.set(s.team.id, BAR_COLORS[i % BAR_COLORS.length]))
    return map
  }, [allStandings, rounds])

  const play = () => { setCurrentIdx(0); setPlaying(true) }
  const pause = () => setPlaying(false)
  const resume = () => setPlaying(true)

  return (
    <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.raceChartCard}>
        <div className={styles.raceChartHeader}>
          <span className={styles.raceChartTitle}>{league.name} – Serierace</span>
          <button className={styles.modalClose} onClick={onClose}>✕ Stäng</button>
        </div>
        <div className={styles.raceChartBody}>
          {loading ? (
            <div className={styles.modalEmpty}>Laddar alla omgångars ställningar…</div>
          ) : (
            <>
              <div className={styles.raceControls}>
                {!playing ? (
                  <button className={styles.racePlayBtn} onClick={currentIdx >= rounds.length - 1 ? play : (currentIdx === 0 ? play : resume)}>
                    {currentIdx >= rounds.length - 1 ? '▶ Spela om' : (currentIdx === 0 ? '▶ Starta' : '▶ Fortsätt')}
                  </button>
                ) : (
                  <button className={styles.racePlayBtn} onClick={pause}>⏸ Pausa</button>
                )}
                {currentIdx > 0 && !playing && (
                  <button className={styles.racePlayBtn} style={{background:'var(--steel-dark)'}} onClick={() => setCurrentIdx(0)}>⏮ Omgång 1</button>
                )}
                <span className={styles.raceRoundLabel}>
                  Omgång {rounds[currentIdx] || 1} / {rounds[rounds.length - 1]}
                </span>
              </div>
              <div className={styles.raceBars}>
                {standings.map(s => (
                  <div key={s.team.id} className={styles.raceBarRow}>
                    <div className={styles.raceBarLabel}>{s.team.name}</div>
                    <div className={styles.raceBarTrack}>
                      <div
                        className={styles.raceBar}
                        style={{
                          width: `${(s.pts / maxPts) * 100}%`,
                          backgroundColor: teamColors.get(s.team.id) || '#888',
                          transition: 'width 0.8s ease-in-out'
                        }}
                      />
                      <span className={styles.raceBarPts}>{s.pts}p</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
