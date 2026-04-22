import { useEffect, useState } from 'react'
import { API } from '../lib/api'
import { fmt, fmtTime } from '../lib/format'
import type { League, Event } from '../lib/types'
import styles from '../styles/Home.module.css'

type Props = {
  allLeagues: League[]
  nationalLeagues: League[]
  favLeagueIds: number[]
  favTeamIds: number[]
  onOpenMatch: (e: Event) => void
}

type LeagueEvents = { league: League; events: Event[] }

export default function TodayMatches({ allLeagues, nationalLeagues, favLeagueIds, favTeamIds, onOpenMatch }: Props) {
  const [groups, setGroups] = useState<{ label: string; items: LeagueEvents[] }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)

      // Only fetch national leagues + favorite leagues (for speed)
      const favSet = new Set(favLeagueIds)
      const nationalIds = new Set(nationalLeagues.map(l => l.id))
      const leaguesToFetch = allLeagues.filter(l => nationalIds.has(l.id) || favSet.has(l.id))

      const results: LeagueEvents[] = []
      await Promise.all(leaguesToFetch.map(async (league) => {
        try {
          const data = await API(`leagues/${league.id}/events`, { from: today, to: today })
          const events: Event[] = (data?.events || [])
            .filter((e: Event) => e.startDate && e.startDate.startsWith(today))
          if (events.length > 0) results.push({ league, events })
        } catch {}
      }))
      if (cancelled) return

      const favTeamSet = new Set(favTeamIds)
      const favItems: LeagueEvents[] = []
      const nationalItems: LeagueEvents[] = []

      for (const le of results) {
        const isFav = favSet.has(le.league.id) ||
          le.events.some(e => favTeamSet.has(e.homeTeam?.id) || favTeamSet.has(e.visitingTeam?.id))
        if (isFav) favItems.push(le)
        if (nationalIds.has(le.league.id)) nationalItems.push(le)
      }

      const grouped: { label: string; items: LeagueEvents[] }[] = []
      if (favItems.length) grouped.push({ label: 'Favoriter', items: favItems })
      if (nationalItems.length) grouped.push({ label: 'Nationellt', items: nationalItems })

      setGroups(grouped)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [allLeagues, nationalLeagues, favLeagueIds, favTeamIds])

  if (loading) return <div className={styles.loading}>Laddar matcher...</div>
  if (!groups.length) return <div className={styles.emptyState}>Inga matcher idag</div>

  return (
    <div>
      {groups.map(g => (
        <div key={g.label} style={{ marginBottom: 24 }}>
          <div className={styles.sidebarGroupLabel} style={{ paddingLeft: 0, borderTop: 'none' }}>{g.label}</div>
          {g.items.map(le => (
            <div key={le.league.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{le.league.name}</div>
              {le.events.map(e => {
                const done = e.status === 'FINISHED'
                const live = e.status === 'ONGOING'
                return (
                  <div key={e.id} className={styles.matchInfoRow} style={{ cursor: 'pointer' }} onClick={() => onOpenMatch(e)}>
                    <span style={{ width: 80, flexShrink: 0, color: 'var(--text-muted)', fontSize: 12 }}>
                      {done ? 'Slut' : live ? 'Live' : `${fmt(e.startDate)} ${fmtTime(e.startDate)}`}
                    </span>
                    <span style={{ flex: 1 }}>{e.homeTeam?.name}</span>
                    <span style={{ fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif', width: 50, textAlign: 'center' }}>
                      {done || live ? `${e.homeTeamScore}\u2013${e.visitingTeamScore}` : '\u2013'}
                    </span>
                    <span style={{ flex: 1, textAlign: 'right' }}>{e.visitingTeam?.name}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
