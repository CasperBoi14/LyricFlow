type WebKitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void
  webkitRequestFullScreen?: () => void
}

type WebKitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => void
  webkitCancelFullScreen?: () => void
}

export function browserFullscreenElement(): Element | null {
  const doc = document as WebKitFullscreenDocument
  return doc.fullscreenElement || doc.webkitFullscreenElement || null
}

export function canUseBrowserFullscreen(): boolean {
  const doc = document as WebKitFullscreenDocument
  const element = document.documentElement as WebKitFullscreenElement
  return (document.fullscreenEnabled && !!element.requestFullscreen) ||
    (doc.webkitFullscreenEnabled !== false && !!(element.webkitRequestFullscreen || element.webkitRequestFullScreen))
}

export async function requestBrowserFullscreen(): Promise<void> {
  const element = document.documentElement as WebKitFullscreenElement
  if (document.fullscreenEnabled && element.requestFullscreen) {
    await element.requestFullscreen()
  } else if (element.webkitRequestFullscreen || element.webkitRequestFullScreen) {
    // iPadOS 15 Safari exposes the older, prefixed Element Fullscreen API.
    const request = element.webkitRequestFullscreen || element.webkitRequestFullScreen
    if (request) request.call(element)
  }
}

export async function exitBrowserFullscreen(): Promise<void> {
  const doc = document as WebKitFullscreenDocument
  if (doc.exitFullscreen && doc.fullscreenElement) await doc.exitFullscreen()
  else (doc.webkitExitFullscreen || doc.webkitCancelFullScreen)?.call(doc)
}
