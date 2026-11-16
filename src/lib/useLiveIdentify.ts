import { useCallback, useEffect, useRef, useState } from 'react'
import { identifyRecorded } from './identify'
import { encodeWav, rmsOf } from './wav'

export type LiveMatch = { title: string; artist: string; album?: string; cover?: string; url?: string; at: number }

const WINDOW_SECONDS = 12
const FIRST_SAMPLE_MS = 9000
const SAMPLE_MS = 10_000
const SILENCE_RMS = 0.0006

export function useLiveIdentify() {
  const [active, setActive] = useState(false)
  const [level, setLevel] = useState(0)
  const [matches, setMatches] = useState<LiveMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [lastAt, setLastAt] = useState<number | null>(null)

  const activeRef = useRef(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const nodesRef = useRef<{ source?: MediaStreamAudioSourceNode; processor?: ScriptProcessorNode; mute?: GainNode }>({})
  const chunksRef = useRef<Float32Array[]>([])
  const rateRef = useRef(44100)
  const timerRef = useRef<number | null>(null)
  const sendingRef = useRef(false)

  const cleanup = useCallback(() => {
    activeRef.current = false
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null }
    const { source, processor, mute } = nodesRef.current
    try { processor?.disconnect(); source?.disconnect(); mute?.disconnect() } catch { /* ignore */ }
    nodesRef.current = {}
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const ctx = ctxRef.current
    ctxRef.current = null
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => { /* ignore */ })
    chunksRef.current = []
    sendingRef.current = false
    setActive(false)
    setLevel(0)
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const sample = useCallback(async () => {
    if (!activeRef.current || sendingRef.current) return
    const snapshot = chunksRef.current.slice()
    if (!snapshot.length) {
      setError('Recording is starting — wait a moment and try again.')
      return
    }
    const seconds = snapshot.reduce((n, c) => n + c.length, 0) / rateRef.current
    if (seconds < 4) {
      setError('Need a few seconds of audio before the first check.')
      return
    }
    if (rmsOf(snapshot) < SILENCE_RMS) {
      setError('Microphone is silent — raise the input level or move closer to the music.')
      return
    }
    sendingRef.current = true
    setAttempts((n) => n + 1)
    try {
      const blob = encodeWav(snapshot, rateRef.current)
      const match = await identifyRecorded(blob)
      setMatches((prev) => [{ ...match, at: Date.now() }, ...prev].slice(0, 8))
      setLastAt(Date.now())
      setError(null)
    } catch (e: any) {
      const message = String(e?.message || '')
      if (/no match/i.test(message)) setError('No match yet — keep the music playing.')
      else setError(message || 'Recognition failed. Check the dev server terminal.')
    } finally {
      sendingRef.current = false
    }
  }, [])

  const start = useCallback(async () => {
    if (activeRef.current) return
    setMatches([])
    setAttempts(0)
    setLastAt(null)
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not expose a microphone API.')
      return
    }
    if (!window.isSecureContext) {
      setError('Microphone access needs localhost or HTTPS. Open the app at http://localhost:5173.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      ctxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      const mute = ctx.createGain()
      mute.gain.value = 0
      rateRef.current = ctx.sampleRate
      chunksRef.current = []
      let lastLevelAt = 0
      processor.onaudioprocess = (e) => {
        const data = new Float32Array(e.inputBuffer.getChannelData(0))
        const chunks = chunksRef.current
        chunks.push(data)
        let total = chunks.reduce((n, c) => n + c.length, 0)
        const max = Math.ceil(rateRef.current * WINDOW_SECONDS)
        while (total > max && chunks.length > 1) {
          total -= chunks[0].length
          chunks.shift()
        }
        const now = performance.now()
        if (now - lastLevelAt > 66) {
          lastLevelAt = now
          let sum = 0
          let count = 0
          for (let i = 0; i < data.length; i += 8) { sum += data[i] * data[i]; count++ }
          setLevel(Math.min(1, Math.sqrt(sum / Math.max(1, count)) * 7))
        }
      }
      source.connect(processor)
      processor.connect(mute)
      mute.connect(ctx.destination)
      nodesRef.current = { source, processor, mute }
      activeRef.current = true
      setActive(true)

      const schedule = (delay: number) => {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          void sample().finally(() => {
            if (activeRef.current) schedule(SAMPLE_MS)
          })
        }, delay)
      }
      schedule(FIRST_SAMPLE_MS)
    } catch {
      cleanup()
      setError('Microphone access was denied or the device is unavailable.')
    }
  }, [cleanup, sample])

  const stop = useCallback(() => { cleanup() }, [cleanup])
  const clear = useCallback(() => {
    setMatches([])
    setError(null)
    setAttempts(0)
    setLastAt(null)
  }, [])

  return { active, level, matches, error, attempts, lastAt, start, stop, clear, checkNow: sample }
}

export type LiveIdentifyState = ReturnType<typeof useLiveIdentify>
