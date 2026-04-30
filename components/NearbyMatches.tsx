import { useEffect, useState, useCallback } from 'react'
import { API } from '../lib/api'
import { findTeamLocation } from '../lib/teamLocations'
import { fmtTime } from '../lib/format'
import type { League, Event } from '../lib/types'
import styles from '../styles/Home.module.css'
import LoadingSpinner from './LoadingSpinner'

type Props = {
  allLeagues: League[]
  onOpenMatch: (e: Event) => void
}

type NearbyMatch = {
  event: Event
  league: League
  distance: number
  venueCity: string
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50, 100]

export default function NearbyMatches({ allLeagues, onOpenMatch }: Props) {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [radius, setRadius] = useState(2)
  const [matches, setMatches] = useState<NearbyMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Din webbläsare stöder inte platstjänster.')
      setLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLoading(false)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Platstjänster nekades. Aktivera platsåtkomst i webbläsaren för att använda denna funktion.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError('Din position kunde inte fastställas.')
        } else {
          setGeoError('Timeout vid hämtning av position. Försök igen.')
        }
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  const fetchNearby = useCallback(async (pos: { lat: number; lng: number }, maxKm: number) => {
    setLoadingMatches(true)
    const today = new Date().toISOString().slice(0, 10)
    const nearby: NearbyMatch[] = []
    const batchSize = 10

    for (let i = 0; i < allLeagues.length; i += batchSize) {
      const batch = allLeagues.slice(i, i + batchSize)
      const results = await Promise.allSettled(
        batch.map(league =>
          API(`leagues/${league.id}/events`, { from: today, to: today })
            .then(data => ({ league, data }))
        )
      )
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        const { league, data } = r.value
        const events: Event[] = (data?.events || [])
          .filter((e: Event) => e.startDate && e.startDate.startsWith(today))
        for (const event of events) {
          const homeName = event.homeTeam?.name
          if (!homeName) continue
          const loc = findTeamLocation(homeName)
          if (!loc) continue
          const dist = haversineKm(pos.lat, pos.lng, loc.lat, loc.lng)
          if (dist <= maxKm) {
            nearby.push({ event, league, distance: dist, venueCity: loc.city })
          }
        }
      }
    }

    nearby.sort((a, b) => a.distance - b.distance)
    setMatches(nearby)
    setLoadingMatches(false)
  }, [allLeagues])

  useEffect(() => {
    if (userPos) fetchNearby(userPos, radius)
  }, [userPos, radius, fetchNearby])

  if (loading) return <LoadingSpinner message="Hämtar din position…" />

  if (geoError) {
    return (
      <div className={styles.emptyState}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
        {geoError}
      </div>
    )
  }

  return (
    <div>
      <div className={styles.nearbyControls}>
        <label className={styles.nearbyLabel}>Radie:</label>
        <div className={styles.nearbyRadiusBtns}>
          {RADIUS_OPTIONS.map(r => (
            <button
              key={r}
              className={`${styles.nearbyRadiusBtn} ${radius === r ? styles.nearbyRadiusActive : ''}`}
              onClick={() => setRadius(r)}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {loadingMatches ? (
        <LoadingSpinner message="Söker matcher i närheten…" />
      ) : matches.length === 0 ? (
        <div className={styles.emptyState}>
          Inga matcher hittades inom {radius} km från din position idag.
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            {matches.length} {matches.length === 1 ? 'match' : 'matcher'} inom {radius} km
          </div>
          {matches.map(m => {
            const e = m.event
            const done = e.status === 'FINISHED'
            const live = e.status === 'ONGOING'
            return (
              <div key={e.id} className={styles.nearbyMatchCard} onClick={() => onOpenMatch(e)}>
                <div className={styles.nearbyMatchHeader}>
                  <span className={styles.nearbyLeagueName}>{m.league.name}</span>
                  <span className={styles.nearbyDistance}>{m.distance < 1 ? `${Math.round(m.distance * 1000)} m` : `${m.distance.toFixed(1)} km`}</span>
                </div>
                <div className={styles.matchInfoRow}>
                  <span style={{ minWidth: 60, maxWidth: 80, flexShrink: 0, color: 'var(--text-muted)', fontSize: 12 }}>
                    {done ? 'Slut' : live ? 'Live' : fmtTime(e.startDate)}
                  </span>
                  <span style={{ flex: 1 }}>{e.homeTeam?.name}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif', minWidth: 36, textAlign: 'center' }}>
                    {done || live ? `${e.homeTeamScore}\u2013${e.visitingTeamScore}` : '\u2013'}
                  </span>
                  <span style={{ flex: 1, textAlign: 'right' }}>{e.visitingTeam?.name}</span>
                </div>
                <div className={styles.nearbyVenue}>📍 {m.venueCity}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
