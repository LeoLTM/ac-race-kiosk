import type { Combo } from './api'

// 83456 -> "1:23.456"
export function formatLapTime(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '-:--.---'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

// Remaining time, rounded up: 59001 -> "1:00"
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${(totalSeconds % 60).toString().padStart(2, '0')}`
}

export function formatEta(etaSec: number | null): string {
  if (etaSec === null) return 'unknown'
  if (etaSec < 60) return 'any moment'
  return `~${Math.round(etaSec / 60)} min`
}

// AC folder names -> readable: "ks_brands_hatch" -> "Brands Hatch"
function prettify(id: string): string {
  return id
    .replace(/^ks_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatTrack(track: string, trackConfig: string): string {
  return trackConfig
    ? `${prettify(track)} ${prettify(trackConfig)}`
    : prettify(track)
}

export function formatCombo(combo: Combo): string {
  return `${formatTrack(combo.track, combo.trackConfig)} · ${prettify(combo.car)}`
}

export function comboKey(combo: Combo): string {
  return `${combo.track}|${combo.trackConfig}|${combo.car}`
}
