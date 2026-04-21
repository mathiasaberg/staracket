import { fmt, fmtTime } from '../lib/format'
import type { MatchModalData } from '../lib/types'
import styles from '../styles/Home.module.css'

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

type Props = {
  modal: MatchModalData
  onClose: () => void
}

export default function MatchModal({ modal, onClose }: Props) {
  const ev = modal.event || modal.baseEvent
  const done = (ev.status || modal.baseEvent.status) === 'FINISHED'
  const homeScore = ev.homeTeamScore ?? modal.baseEvent.homeTeamScore
  const awayScore = ev.visitingTeamScore ?? modal.baseEvent.visitingTeamScore

  // facts from the API = { arena: { id, name, city, position }, spectators: number }
  const facts = ev.facts || {}
  const arena = facts.arena || ev.venue || null
  const spectators = facts.spectators ?? ev.attendance ?? null

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

        <div className={styles.modalBody}>
          {modal.loading && <div className={styles.modalEmpty}>Laddar matchdata…</div>}

          {!modal.loading && (
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
                    <span>{ev.finishedTimeStatus === 'AFTER_EXTRA_TIME' ? 'Efter förlängning' : ev.finishedTimeStatus === 'AFTER_PENALTY' ? 'Avgört på straffar' : ev.finishedTimeStatus}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
