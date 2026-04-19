export function fmt(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtTime(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}
