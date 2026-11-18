export type SoundSettings = {
  volume: number
  bass: number
  treble: number
  vocals: number
}

export class AudioEffects {
  private context: AudioContext
  private dry: GainNode
  private wet: GainNode
  private low: BiquadFilterNode
  private high: BiquadFilterNode
  private output: GainNode

  constructor(element: HTMLAudioElement) {
    this.context = new AudioContext()
    const source = this.context.createMediaElementSource(element)
    const split = this.context.createChannelSplitter(2)
    const left = this.context.createGain()
    const right = this.context.createGain()
    this.dry = this.context.createGain()
    this.wet = this.context.createGain()
    this.low = this.context.createBiquadFilter()
    this.high = this.context.createBiquadFilter()
    this.output = this.context.createGain()

    left.gain.value = 0.5
    right.gain.value = -0.5
    this.low.type = 'lowshelf'
    this.low.frequency.value = 180
    this.high.type = 'highshelf'
    this.high.frequency.value = 3500

    source.connect(this.dry)
    source.connect(split)
    split.connect(left, 0)
    split.connect(right, 1)
    left.connect(this.wet)
    right.connect(this.wet)
    this.dry.connect(this.low)
    this.wet.connect(this.low)
    this.low.connect(this.high)
    this.high.connect(this.output)
    this.output.connect(this.context.destination)
  }

  update(settings: SoundSettings) {
    this.dry.gain.value = 1 - settings.vocals / 100
    this.wet.gain.value = settings.vocals / 100
    this.low.gain.value = settings.bass
    this.high.gain.value = settings.treble
    this.output.gain.value = settings.volume / 100
    if (this.context.state === 'suspended') void this.context.resume()
  }

  close() { void this.context.close() }
}
