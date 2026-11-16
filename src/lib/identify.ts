export type IdentifyMatch = {
  title: string
  artist: string
  album?: string
  cover?: string
  url?: string
  provider?: string
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result || '')
      resolve(s.includes(',') ? s.split(',')[1] : s)
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function identifyRecorded(blob: Blob): Promise<IdentifyMatch> {
  if (!import.meta.env.DEV) {
    throw new Error('Song identification is unavailable on the static GitHub Pages build.')
  }
  const sample = await blobToBase64(blob)
  const res = await fetch('/api/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sample }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || data?.message || 'Identification failed')
  if (!data?.title) throw new Error('No match found')
  return data as IdentifyMatch
}
