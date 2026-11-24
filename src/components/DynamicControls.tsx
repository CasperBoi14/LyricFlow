import { DEFAULT_DYNAMIC_SETTINGS, DYNAMIC_ANIMATIONS, type DynamicSettings } from '../lib/dynamicSettings'

export function DynamicControls({ value, onChange }: { value: DynamicSettings; onChange: (patch: Partial<DynamicSettings>) => void }) {
  return (
    <fieldset className="dynamic-controls">
      <legend>Dynamic appearance</legend>
      <label className="dynamic-color"><span>Word color</span><input type="color" value={value.wordColor} onChange={(e) => onChange({ wordColor: e.target.value })} /></label>
      <label className="dynamic-color"><span>Edge lighting</span><input type="color" value={value.lightColor} onChange={(e) => onChange({ lightColor: e.target.value })} /></label>
      <label className="settings-slider">Animation
        <select className="select" value={value.animation} onChange={(e) => onChange({ animation: e.target.value as DynamicSettings['animation'] })}>
          {Object.entries(DYNAMIC_ANIMATIONS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
        </select>
      </label>
      <label className="settings-slider">Flow direction
        <select className="select" value={value.direction} onChange={(e) => onChange({ direction: e.target.value === 'down' ? 'down' : 'up' })}>
          <option value="up">Up</option><option value="down">Down</option>
        </select>
      </label>
      <label className="settings-slider"><span>Intensity <output>{value.intensity}%</output></span>
        <input type="range" min={0} max={100} step={1} value={value.intensity} onChange={(e) => onChange({ intensity: Number(e.target.value) })} />
      </label>
      <label className="settings-slider"><span>Faded words <output>{value.trail}%</output></span>
        <input type="range" min={0} max={100} step={1} value={value.trail} onChange={(e) => onChange({ trail: Number(e.target.value) })} />
      </label>
      <button type="button" className="btn small" onClick={() => onChange(DEFAULT_DYNAMIC_SETTINGS)}>Reset appearance</button>
    </fieldset>
  )
}
