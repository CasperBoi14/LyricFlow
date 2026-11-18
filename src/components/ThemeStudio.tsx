import { useState } from 'react'
import type { VisualPreset, VisualSettings } from '../lib/visualSettings'

type Props = {
  value: VisualSettings
  presets: VisualPreset[]
  onChange: (patch: Partial<VisualSettings>) => void
  onSave: (name: string) => void
  onApply: (preset: VisualPreset) => void
  onDelete: (name: string) => void
  onReset: () => void
}

export function ThemeStudio({ value, presets, onChange, onSave, onApply, onDelete, onReset }: Props) {
  const [name, setName] = useState('')
  const select = <K extends keyof VisualSettings>(key: K, label: string, choices: { value: VisualSettings[K]; label: string }[]) => (
    <label className="settings-slider" key={key}><span>{label}</span>
      <select className="select" value={String(value[key])} onChange={(event) => onChange({ [key]: event.target.value })}>
        {choices.map((choice) => <option key={String(choice.value)} value={String(choice.value)}>{choice.label}</option>)}
      </select>
    </label>
  )
  return (
    <section className="settings-card theme-studio">
      <div className="settings-heading"><h2>Lyric Theme Studio</h2><button className="btn small ghost" onClick={onReset}>Restore defaults</button></div>
      <div className="theme-grid">
        {select('font', 'Font', [{ value: 'manrope', label: 'Modern' }, { value: 'serif', label: 'Editorial' }, { value: 'mono', label: 'Mono' }])}
        {select('align', 'Text alignment', [{ value: 'center', label: 'Center' }, { value: 'left', label: 'Left' }])}
        {select('position', 'Lyric position', [{ value: 'center', label: 'Center' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }])}
        {select('highlight', 'Highlight', [{ value: 'glow', label: 'Glow' }, { value: 'underline', label: 'Underline' }, { value: 'solid', label: 'Solid' }])}
        {select('background', 'Background', [{ value: 'ambient', label: 'Ambient colors' }, { value: 'artwork', label: 'Album artwork' }, { value: 'plain', label: 'Plain dark' }])}
      </div>
      <label className="settings-slider"><span>Background blur <output>{value.blur}px</output></span><input type="range" min={0} max={70} step={5} value={value.blur} onChange={(event) => onChange({ blur: Number(event.target.value) })} /></label>
      <label className="settings-slider"><span>Background opacity <output>{value.transparency}%</output></span><input type="range" min={20} max={100} step={5} value={value.transparency} onChange={(event) => onChange({ transparency: Number(event.target.value) })} /></label>
      <label className="settings-switch"><span>Animate atmosphere and transitions</span><input type="checkbox" checked={value.animations} onChange={(event) => onChange({ animations: event.target.checked })} /></label>
      <div className="preset-row"><input className="search" value={name} onChange={(event) => setName(event.target.value)} placeholder="Preset name" maxLength={32} /><button className="btn small" disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName('') }}>Save preset</button></div>
      {presets.length > 0 && <div className="preset-list">{presets.map((preset) => <div key={preset.name}><button className="btn small" onClick={() => onApply(preset)}>{preset.name}</button><button className="btn small ghost" onClick={() => onDelete(preset.name)} aria-label={`Delete ${preset.name}`}>×</button></div>)}</div>}
    </section>
  )
}
