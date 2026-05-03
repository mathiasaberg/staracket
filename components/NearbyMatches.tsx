import { useEffect, useState, useCallback, useRef } from 'react'
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
  leagueId: number
  leagueName: string
  distance: number
  venueCity: string
  venueName: string | null
}

type ClosestVenue = { name: string | null; city: string; distance: number }

const RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50, 100]
const MAX_RADIUS = 100 // Fetch all within 100 km, filter client-side

export default function NearbyMatches({ allLeagues, onOpenMatch }: Props) {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [radius, setRadius] = useState(2)
  const [allNearby, setAllNearby] = useState<NearbyMatch[]>([]) // Full result set (100 km)
  const [matches, setMatches] = useState<NearbyMatch[]>([])     // Filtered by current radius
  const [closestVenue, setClosestVenue] = useState<ClosestVenue | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const fetchedPos = useRef<string | null>(null) // Track which position we already fetched for

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

  // Fetch all nearby matches (max radius) once per position
  const fetchNearby = useCallback(async (pos: { lat: number; lng: number }) => {
    const posKey = `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`
    if (fetchedPos.current === posKey) return // Already fetched for this position
    fetchedPos.current = posKey

    setLoadingMatches(true)
    const today = new Date().toISOString().slice(0, 10)
    const params = new URLSearchParams({
      lat: String(pos.lat),
      lng: String(pos.lng),
      radius: String(MAX_RADIUS),
      date: today,
    })

    try {
      const res = await fetch(`/api/nearby?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const nearby: NearbyMatch[] = (data.matches || []).map((m: any) => ({
        event: m.event,
        leagueId: m.leagueId,
        leagueName: m.leagueName,
        distance: m.distance,
        venueCity: m.venueCity,
        venueName: m.venueName || null,
      }))

      setAllNearby(nearby)
      if (data.closestVenue) setClosestVenue(data.closestVenue)

      if (data.meta?.unmatchedTeams?.length > 0) {
        console.log(`[NearbyMatches] Hemmalag utan matchad position:`, data.meta.unmatchedTeams)
      }
    } catch (err) {
      console.error('[NearbyMatches] Fetch error:', err)
      setAllNearby([])
    } finally {
      setLoadingMatches(false)
    }
  }, [])

  // Fetch when position is available
  useEffect(() => {
    if (userPos) fetchNearby(userPos)
  }, [userPos, fetchNearby])

  // Client-side filter when radius changes (instant, no refetch)
  useEffect(() => {
    setMatches(allNearby.filter(m => m.distance <= radius))
  }, [allNearby, radius])

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

      {userPos && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'monospace' }}>
          📍 Din position: {userPos.lat.toFixed(5)}, {userPos.lng.toFixed(5)}
          {closestVenue && (
            <span> — Närmaste arena: {closestVenue.name ? `${closestVenue.name}, ${closestVenue.city}` : closestVenue.city} ({closestVenue.distance < 1 ? `${Math.round(closestVenue.distance * 1000)} m` : `${closestVenue.distance} km`})</span>
          )}
        </div>
      )}

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
                  <span className={styles.nearbyLeagueName}>{m.leagueName}</span>
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
                <div className={styles.nearbyVenue}>
                  📍 {m.venueName ? `${m.venueName}, ${m.venueCity}` : m.venueCity}
                  <span style={{ marginLeft: 8, opacity: 0.7 }}>
                    ({m.distance < 1 ? `${Math.round(m.distance * 1000)} m` : `${m.distance.toFixed(1)} km`})
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
