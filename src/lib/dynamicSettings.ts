export const DYNAMIC_ANIMATIONS = { impact: 'Impact', rush: 'Rush', drift: 'Drift', still: 'Still' } as const

export type DynamicSettings = {
  wordColor: string
  lightColor: string
  animation: keyof typeof DYNAMIC_ANIMATIONS
  intensity: number
  trail: number
  direction: 'up' | 'down'
}

const KEY = 'lf-dynamic-visuals'
export const DEFAULT_DYNAMIC_SETTINGS: DynamicSettings = {
  wordColor: '#ff2d13', lightColor: '#f06325', animation: 'impact', intensity: 82, trail: 48, direction: 'up',
}

export function loadDynamicSettings(): DynamicSettings {
  const defaults = DEFAULT_DYNAMIC_SETTINGS
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    const color = (value: unknown, fallback: string) =>
      typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback
    const percent = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback
    return {
      wordColor: color(saved.wordColor, defaults.wordColor),
      lightColor: color(saved.lightColor, defaults.lightColor),
      animation: Object.hasOwn(DYNAMIC_ANIMATIONS, saved.animation) ? saved.animation : defaults.animation,
      intensity: percent(saved.intensity, defaults.intensity),
      trail: percent(saved.trail, defaults.trail),
      direction: saved.direction === 'down' ? 'down' : defaults.direction,
    }
  } catch { return defaults }
}

export function saveDynamicSettings(value: DynamicSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* keep the current session usable */ }
}
