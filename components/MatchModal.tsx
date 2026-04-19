import { fmt, fmtTime } from '../lib/format'
import type { MatchModalData } from '../lib/types'
import styles from '../styles/Home.module.css'

function factIcon(type?: string): string {
  const t = (type || '').toUpperCase()
  if (t.includes('GOAL')) return '⚽'
  if (t.includes('YELLOW')) return '🟨'
  if (t.includes('RED')) return '🟥'
  if (t.includes('SUBSTITUT') || t === 'SUB') return '🔄'
  if (t.includes('PENALTY')) return '🎯'
  return '•'
}

function factLabel(type?: string): string {
  const t = (type || '').toUpperCase()
  if (t.includes('GOAL')) return 'Mål'
  if (t.includes('YELLOW')) return 'Gult kort'
  if (t.includes('RED')) return 'Rött kort'
  if (t.includes('SUBSTITUT') || t === 'SUB') return 'Byte'
  if (t.includes('PENALTY')) return 'Straff'
  return type || '–'
}

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
  const allFacts = [...modal.facts].sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0))

  const referee = ev.referee?.name || ev.referees?.[0]?.name || null
  const halfHome = ev.homeTeamHalfTimeScore ?? ev.halfTimeHomeScore ?? null
  const halfAway = ev.visitingTeamHalfTimeScore ?? ev.halfTimeAwayScore ?? null
  const hasHalftime = halfHome != null && halfAway != null

  return (
    <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <button className={styles.modalClose} onClick={onClose}>{'✕'} Stäng</button>
          {(ev.league?.name || modal.baseEvent.round) && (
            <div className={styles.modalLeagueName}>
              {ev.league?.name || `Omgång ${modal.baseEvent.round}`}
            </div>
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
              {done && hasHalftime && (
                <span className={styles.modalHalftime}>({halfHome}–{halfAway})</span>
              )}
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
              {/* Always show match info */}
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
                {ev.venue?.name && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Arena</span>
                    <span>{ev.venue.name}{ev.venue.capacity ? ` (${ev.venue.capacity.toLocaleString('sv-SE')} platser)` : ''}</span>
                  </div>
                )}
                {ev.attendance != null && ev.attendance > 0 && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Åskådare</span>
                    <span>{ev.attendance.toLocaleString('sv-SE')}</span>
                  </div>
                )}
                {referee && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Domare</span>
                    <span>{referee}</span>
                  </div>
                )}
                {hasHalftime && (
                  <div className={styles.matchInfoRow}>
                    <span className={styles.matchInfoLabel}>Halvtid</span>
                    <span>{halfHome}–{halfAway}</span>
                  </div>
                )}
              </div>

              {allFacts.length > 0 && (
                <>
                  <div className={styles.factsTitle} style={{marginTop:'1.25rem'}}>Matchhändelser</div>
                  {allFacts.map((f, i) => {
                    const isHome = f.team?.id === modal.baseEvent.homeTeam.id
                    return (
                      <div key={i} className={`${styles.factRow} ${isHome ? styles.factHome : styles.factAway}`}>
                        <div className={styles.factMinute}>{f.minute != null ? `${f.minute}'` : ''}</div>
                        <div className={styles.factIconCell}>{factIcon(f.type)}</div>
                        <div className={styles.factInfo}>
                          <span className={styles.factType}>{factLabel(f.type)}</span>
                          {f.player?.name && <span className={styles.factPlayer}>{f.player.name}</span>}
                          {f.assistant?.name && <span className={styles.factAssist}>(ass. {f.assistant.name})</span>}
                          {f.description && !f.player?.name && <span className={styles.factPlayer}>{f.description}</span>}
                        </div>
                        <div className={styles.factTeam}>{f.team?.name || ''}</div>
                      </div>
                    )
                  })}
                </>
              )}

              {allFacts.length === 0 && done && (
                <div className={styles.modalEmpty} style={{marginTop:'1rem'}}>
                  Inga detaljerade händelser tillgängliga för denna match
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
