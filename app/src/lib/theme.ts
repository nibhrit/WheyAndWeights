// Appearance: follow the phone (system), or always light / dark. Saved on this device only.
// index.html applies the saved choice before the first paint, so there's no flash.
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'ww:theme'
const BG = { light: '#E8EBEA', dark: '#121517' }

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch { return 'system' }
}

export function setTheme(t: Theme) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t) } catch { /* blocked: applies until reload */ }
  const root = document.documentElement
  if (t === 'system') delete root.dataset.theme
  else root.dataset.theme = t
  // The status-bar colour: one tag per scheme; a fixed choice sets both
  document.querySelectorAll<HTMLMetaElement>('meta[name=theme-color]').forEach((m) => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light'
    m.content = BG[t === 'system' ? scheme : t]
  })
}
