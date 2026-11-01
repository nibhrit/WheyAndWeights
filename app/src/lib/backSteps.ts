import { useEffect, useRef } from 'react'

// Phone back navigation inside the app (TF-62). Each sub-screen that's open (an exercise, Plan week, Settings, the
// scanner) adds one browser-history step, so Android's back button and any browser back gesture close it.
// iPhone home-screen apps often don't get Safari's swipe-back gesture, so the app adds its own: swipe right from the
// left edge goes back one step. Switching tabs is not a step (like iPhone apps).

const stack: string[] = []   // open steps, innermost last

export function useBackStep(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])

  useEffect(() => {
    if (!open) return
    const id = Math.random().toString(36).slice(2)
    stack.push(id)
    history.pushState({ ...(history.state ?? {}), wwStep: id }, '')
    let popped = false
    const onPop = () => {
      // Only the innermost open step closes, and only when its history entry was left
      if (stack[stack.length - 1] === id && history.state?.wwStep !== id) {
        popped = true
        stack.pop()
        closeRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      const i = stack.indexOf(id)
      if (i >= 0) stack.splice(i, 1)
      // Closed with an on-screen button: remove its history entry too, so back doesn't need pressing twice
      if (!popped && history.state?.wwStep === id) history.back()
    }
  }, [open])
}

const EDGE = 24       // px from the left edge where the swipe must start
const DISTANCE = 70   // px to the right before it counts

// Swipe right from the left edge = back, when something is open (installed once, in App)
export function installEdgeSwipe() {
  let start: { x: number; y: number } | null = null
  const down = (e: TouchEvent) => {
    const t = e.touches[0]
    start = e.touches.length === 1 && t.clientX <= EDGE && stack.length ? { x: t.clientX, y: t.clientY } : null
  }
  const up = (e: TouchEvent) => {
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = Math.abs(t.clientY - start.y)
    start = null
    if (dx > DISTANCE && dy < dx * 0.6 && stack.length) history.back()
  }
  const cancel = () => { start = null }
  window.addEventListener('touchstart', down, { passive: true })
  window.addEventListener('touchend', up, { passive: true })
  window.addEventListener('touchcancel', cancel, { passive: true })
  return () => {
    window.removeEventListener('touchstart', down)
    window.removeEventListener('touchend', up)
    window.removeEventListener('touchcancel', cancel)
  }
}
