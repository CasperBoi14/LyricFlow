import type { Ref } from 'react'
import type { FullscreenStyle } from '../types'
import type { DynamicSettings } from '../lib/dynamicSettings'
import { DynamicControls } from './DynamicControls'

type Props = {
  dialogRef: Ref<HTMLDialogElement>
  fullscreenStyle: FullscreenStyle
  dynamicSettings: DynamicSettings
  onDynamicSettingsChange: (patch: Partial<DynamicSettings>) => void
  canFillScreen: boolean
  playing: boolean
  onStyleChange: (style: FullscreenStyle) => void
  onTogglePlay: () => void
  onExitFullscreen: () => void
  onFillScreen: () => void
  onClose: () => void
}

export function SettingsDialog({ dialogRef, fullscreenStyle, dynamicSettings, onDynamicSettingsChange, canFillScreen, playing, onStyleChange, onTogglePlay, onExitFullscreen, onFillScreen, onClose }: Props) {
  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onClose={onClose}
      onKeyDown={(event) => { if (event.currentTarget.open) event.stopPropagation() }}
    >
      <form method="dialog">
        <h2 id="settings-title">Settings</h2>
        <fieldset className="settings-styles">
          <legend>Fullscreen Visualisation Style</legend>
          <label className="settings-option">
            <input type="radio" name="fullscreenStyle" checked={fullscreenStyle === 'classic'} onChange={() => onStyleChange('classic')} />
            <span><strong>Classic</strong><small>Album art, word-by-word lyrics and playback controls.</small></span>
          </label>
          <label className="settings-option">
            <input type="radio" name="fullscreenStyle" checked={fullscreenStyle === 'dynamic'} onChange={() => onStyleChange('dynamic')} />
            <span><strong>Dynamic</strong><small>One large word at a time, with faded words flowing past.</small></span>
          </label>
        </fieldset>
        {fullscreenStyle === 'dynamic' && <DynamicControls value={dynamicSettings} onChange={onDynamicSettingsChange} />}
        <p className="settings-help">
          Press <kbd>S</kbd> for settings in fullscreen. In Dynamic, you can also tap the stage.
          Use <kbd>Space</kbd> to pause or resume, <kbd>←</kbd> or <kbd>→</kbd> to seek, and <kbd>Esc</kbd> to exit.
        </p>
        <div className="settings-actions">
          <button className="btn" type="button" onClick={onTogglePlay}>{playing ? 'Pause' : 'Play'}</button>
          {canFillScreen && <button className="btn" type="button" onClick={onFillScreen}>Fill screen</button>}
          <button className="btn" type="button" onClick={onExitFullscreen}>Exit fullscreen</button>
          <button className="btn primary" type="submit">Done</button>
        </div>
      </form>
    </dialog>
  )
}
