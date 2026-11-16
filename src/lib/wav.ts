export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  let length = 0
  for (const c of chunks) length += c.length
  const pcm = new Int16Array(length)
  let offset = 0
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i]))
      pcm[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
  }
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const writeStr = (at: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(at + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  return new Blob([header, pcm], { type: 'audio/wav' })
}

export function rmsOf(chunks: Float32Array[]): number {
  let sum = 0
  let count = 0
  for (const c of chunks) {
    for (let i = 0; i < c.length; i += 4) {
      sum += c[i] * c[i]
      count++
    }
  }
  return count ? Math.sqrt(sum / count) : 0
}
