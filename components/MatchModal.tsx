import { useState } from 'react'
import { fmt, fmtTime } from '../lib/format'
import type { MatchModalData, ApiFootballEvent, ApiFootballLineup } from '../lib/types'
import styles from '../styles/Home.module.css'
import LoadingSpinner from './LoadingSpinner'

function statusText(status?: string): string {
  switch (status) {
    case 'FINISHED': return 'Slutförd'
    case 'NOT_STARTED': return 'Ej startad'
    case 'ONGOING': return 'Pågår'
    case 'POSTPONED': return 'Uppskjuten'
    case 'CANCELLED': return 'Inställd'
    default: return status || ''
  }
}

function eventIcon(type: string, detail: string): string {
  if (type === 'Goal') return '⚽'
  if (type === 'Card' && detail.includes('Yellow')) return '🟨'
  if (type === 'Card' && detail.includes('Red')) return '🟥'
  if (type === 'subst') return '🔄'
  return '●'
}

function minuteStr(time: { elapsed: number; extra: number | null }): string {
  if (time.extra) return `${time.elapsed}+${time.extra}'`
  return `${time.elapsed}'`
}

type Tab = 'info' | 'events' | 'lineups'

type Props = {
  modal: MatchModalData
  onClose: () => void
}

function EventsTab({ events }: { events: ApiFootballEvent[] }) {
  const sorted = [...events].sort((a, b) => {
    const aMin = a.time.elapsed * 100 + (a.time.extra || 0)
    const bMin = b.time.elapsed * 100 + (b.time.extra || 0)
    return aMin - bMin
  })

  return (
    <div className={styles.eventTimeline}>
      {sorted.map((ev, i) => (
        <div key={i} className={styles.eventRow}>
          <span className={styles.eventMinute}>{minuteStr(ev.time)}</span>
          <span className={styles.eventIcon}>{eventIcon(ev.type, ev.detail)}</span>
          <div className={styles.eventDetail}>
            {ev.type === 'subst' ? (
              <>
                <span className={styles.eventPlayer}>{ev.assist?.name || '?'}</span>
                <span className={styles.eventSubOut}>{'←'} {ev.player.name}</span>
              </>
            ) : (
              <>
                <span className={styles.eventPlayer}>{ev.player.name}</span>
                {ev.type === 'Goal' && ev.assist?.name && (
                  <span className={styles.eventAssist}>Assist: {ev.assist.name}</span>
                )}
                {ev.type === 'Card' && ev.comments && (
                  <span className={styles.eventAssist}>{ev.comments}</span>
                )}
              </>
            )}
            <span className={styles.eventTeamName}>{ev.team.name}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function LineupsTab({ lineups, events }: { lineups: ApiFootballLineup[]; events?: ApiFootballEvent[] }) {
  const subbedOut = new Set<number>()
  const subMinutes: Record<number, string> = {}
  if (events) {
    for (const ev of events) {
      if (ev.type === 'subst') {
        subbedOut.add(ev.player.id)
        subMinutes[ev.player.id] = minuteStr(ev.time)
      }
    }
  }

  return (
    <div className={styles.lineupColumns}>
      {lineups.map((lineup) => (
        <div key={lineup.team.id} className={styles.lineupTeam}>
          <div className={styles.lineupTeamHeader}>
            <span className={styles.lineupTeamName}>{lineup.team.name}</span>
            <span className={styles.lineupFormation}>{lineup.formation}</span>
          </div>
          {lineup.coach?.name && (
            <div className={styles.lineupCoach}>Tränare: {lineup.coach.name}</div>
          )}
          <div className={styles.lineupLabel}>Startuppställning</div>
          {lineup.startXI.map(({ player: p }) => (
            <div key={p.id} className={styles.lineupPlayer}>
              <span className={styles.lineupNumber}>{p.number}</span>
              <span className={styles.lineupPos}>{p.pos}</span>
              <span className={`${styles.lineupPlayerName} ${subbedOut.has(p.id) ? styles.lineupSubbed : ''}`}>
                {p.name}
              </span>
              {subbedOut.has(p.id) && (
                <span className={styles.lineupSubMinute}>{'🔄'} {subMinutes[p.id]}</span>
              )}
            </div>
          ))}
          <div className={styles.lineupLabel}>Avbytare</div>
          {lineup.substitutes.map(({ player: p }) => (
            <div key={p.id} className={styles.lineupPlayer}>
              <span className={styles.lineupNumber}>{p.number}</span>
              <span className={styles.lineupPos}>{p.pos}</span>
              <span className={styles.lineupPlayerName}>{p.name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function MatchModal({ modal, onClose }: Props) {
  const ev = modal.event || modal.baseEvent
  const done = (ev.status || modal.baseEvent.status) === 'FINISHED'
  const homeScore = ev.homeTeamScore ?? modal.baseEvent.homeTeamScore
  const awayScore = ev.visitingTeamScore ?? modal.baseEvent.visitingTeamScore

  const facts = ev.facts || {}
  const arena = facts.arena || ev.venue || null
  const spectators = facts.spectators ?? ev.attendance ?? null

  const hasApiData = (modal.apiEvents && modal.apiEvents.length > 0) || (modal.apiLineups && modal.apiLineups.length > 0)
  const [tab, setTab] = useState<Tab>('info')

  return (
    <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <button className={styles.modalClose} onClick={onClose}>{'✕'} Stäng</button>
          {ev.league?.name && (
            <div className={styles.modalLeagueName}>
              {ev.league.name}
              {modal.baseEvent.round > 0 ? ` · Omgång ${modal.baseEvent.round}` : ''}
            </div>
          )}
          {!ev.league?.name && modal.baseEvent.round > 0 && (
            <div className={styles.modalLeagueName}>Omgång {modal.baseEvent.round}</div>
          )}
          <div className={styles.modalTeams}>
            <div className={styles.modalTeamHome}>
              {(ev.homeTeam?.logo || modal.baseEvent.homeTeam?.logo) && (
                <img src={ev.homeTeam?.logo || modal.baseEvent.homeTeam?.logo} alt="" className={styles.modalTeamLogo} />
              )}
              {modal.baseEvent.homeTeam.name}
            </div>
            <div className={styles.modalScore}>
              {done
                ? `${homeScore ?? '–'}–${awayScore ?? '–'}`
                : modal.baseEvent.startDate
                  ? `${fmt(modal.baseEvent.startDate)} ${fmtTime(modal.baseEvent.startDate)}`
                  : '–'}
            </div>
            <div className={styles.modalTeamAway}>
              {(ev.visitingTeam?.logo || modal.baseEvent.visitingTeam?.logo) && (
                <img src={ev.visitingTeam?.logo || modal.baseEvent.visitingTeam?.logo} alt="" className={styles.modalTeamLogo} />
              )}
              {modal.baseEvent.visitingTeam.name}
            </div>
          </div>
        </div>

        {(hasApiData || modal.apiLoading) && (
          <div className={styles.modalTabs}>
            <button className={`${styles.modalTab} ${tab === 'info' ? styles.modalTabActive : ''}`} onClick={() => setTab('info')}>Matchinfo</button>
            <button className={`${styles.modalTab} ${tab === 'events' ? styles.modalTabActive : ''}`} onClick={() => setTab('events')}>Händelser</button>
            <button className={`${styles.modalTab} ${tab === 'lineups' ? styles.modalTabActive : ''}`} onClick={() => setTab('lineups')}>Uppställning</button>
          </div>
        )}

        <div className={styles.modalBody}>
          {modal.loading && <LoadingSpinner message="Laddar matchdata…" inline />}

          {!modal.loading && tab === 'info' && (
            <>
              <div className={styles.factsTitle}>Matchinfo</div>
              <div className={styles.matchInfoGrid}>
                {modal.baseEvent.startDate && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Datum</span>
                    <span>{fmt(modal.baseEvent.startDate)} kl. {fmtTime(modal.baseEvent.startDate)}</span>
                  </div>
                )}
                {modal.baseEvent.round != null && modal.baseEvent.round > 0 && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Omgång</span>
                    <span>{modal.baseEvent.round}</span>
                  </div>
                )}
                <div className={styles.matchInfoRow}>
                  <span className={styles.matchInfoLabel}>Status</span>
                  <span>{statusText(ev.status || modal.baseEvent.status)}</span>
                </div>
                {arena?.name && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Arena</span>
                    <span>{arena.name}{arena.city ? `, ${arena.city}` : ''}</span>
                  </div>
                )}
                {spectators != null && spectators > 0 && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Åskådare</span>
                    <span>{spectators.toLocaleString('sv-SE')}</span>
                  </div>
                )}
                {ev.finishedTimeStatus && ev.finishedTimeStatus !== 'ORDINARY_TIME' && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Tid</span>
                    <span>{ev.finishedTimeStatus === 'AFTER_EXTRA_TIME' ? 'Efter förlängning' : ev.finishedTimeStatus === 'AFTER_PENALTY' ? 'Avgjort på straffar' : ev.finishedTimeStatus}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {!modal.loading && tab === 'events' && (
            <>
              {modal.apiLoading && <LoadingSpinner message="Laddar händelser…" inline />}
              {!modal.apiLoading && modal.apiEvents && modal.apiEvents.length > 0 && (
                <EventsTab events={modal.apiEvents} />
              )}
              {!modal.apiLoading && (!modal.apiEvents || modal.apiEvents.length === 0) && (
                <div className={styles.modalEmpty}>Inga händelser tillgängliga</div>
              )}
            </>
          )}

          {!modal.loading && tab === 'lineups' && (
            <>
              {modal.apiLoading && <LoadingSpinner message="Laddar uppställningar…" inline />}
              {!modal.apiLoading && modal.apiLineups && modal.apiLineups.length > 0 && (
                <LineupsTab lineups={modal.apiLineups} events={modal.apiEvents} />
              )}
              {!modal.apiLoading && (!modal.apiLineups || modal.apiLineups.length === 0) && (
                <div className={styles.modalEmpty}>Inga uppställningar tillgängliga</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
