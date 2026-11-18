export type VisualSettings = {
  font: 'manrope' | 'serif' | 'mono'
  align: 'left' | 'center'
  position: 'top' | 'center' | 'bottom'
  highlight: 'glow' | 'underline' | 'solid'
  background: 'ambient' | 'artwork' | 'plain'
  blur: number
  transparency: number
  animations: boolean
  widget: boolean
  widgetPosition: 'top-right' | 'bottom-right'
  screensaverMinutes: number
}

export type VisualPreset = { name: string; settings: VisualSettings }

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  font: 'manrope', align: 'center', position: 'center', highlight: 'glow', background: 'ambient',
  blur: 30, transparency: 72, animations: true, widget: false, widgetPosition: 'bottom-right', screensaverMinutes: 0,
}

const SETTINGS_KEY = 'lf-visual-settings-v1'
const PRESETS_KEY = 'lf-visual-presets-v1'

export function loadVisualSettings(): VisualSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    return saved && typeof saved === 'object' ? { ...DEFAULT_VISUAL_SETTINGS, ...saved } : DEFAULT_VISUAL_SETTINGS
  } catch { return DEFAULT_VISUAL_SETTINGS }
}

export function saveVisualSettings(settings: VisualSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* keep the current session usable */ }
}

export function loadVisualPresets(): VisualPreset[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]')
    return Array.isArray(saved) ? saved.filter((item) => typeof item?.name === 'string' && item.settings).slice(0, 12) : []
  } catch { return [] }
}

export function saveVisualPresets(presets: VisualPreset[]) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.slice(0, 12))) } catch { /* ignore storage failure */ }
}
