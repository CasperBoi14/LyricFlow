import { useEffect, useState } from 'react'

type Colors = { primary: string; secondary: string }
const fallback: Colors = { primary: 'rgb(107 82 215)', secondary: 'rgb(39 160 153)' }
const cache = new Map<string, Colors>()

function fromPixels(data: Uint8ClampedArray): Colors {
  let r = 0, g = 0, b = 0, count = 0
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 160) continue
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
    if (brightness < 22 || brightness > 238) continue
    r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1
  }
  if (!count) return fallback
  const red = Math.round(r / count), green = Math.round(g / count), blue = Math.round(b / count)
  return {
    primary: `rgb(${red} ${green} ${blue})`,
    secondary: `rgb(${Math.round((blue + green) / 2)} ${Math.round((red + blue) / 2)} ${Math.round((green + red) / 2)})`,
  }
}

export function useAtmosphere(cover: string | undefined): Colors {
  const [colors, setColors] = useState<Colors>(fallback)
  useEffect(() => {
    if (!cover?.startsWith('http') || cache.has(cover)) return
    let active = true
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 24
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(image, 0, 0, 24, 24)
        const result = fromPixels(context.getImageData(0, 0, 24, 24).data)
        cache.set(cover, result)
        if (active) setColors(result)
      } catch { if (active) setColors(fallback) }
    }
    image.onerror = () => { if (active) setColors(fallback) }
    image.src = cover
    return () => { active = false; image.onload = null; image.onerror = null }
  }, [cover])
  return cover?.startsWith('http') ? cache.get(cover) || colors : fallback
}
