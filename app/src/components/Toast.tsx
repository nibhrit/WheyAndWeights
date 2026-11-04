import { useRef, useState } from 'react'
import { dismissToast, useToast } from '../data/store'

type ToastValue = NonNullable<ReturnType<typeof useToast>>

export default function Toast() {
  const toast = useToast()
  return toast ? <ToastCard key={toast.id} toast={toast} /> : null
}

const MOVE = 8        // px before a touch counts as a drag (less is a tap)
const AWAY_X = 70     // px sideways to dismiss
const AWAY_Y = 40     // px down to dismiss

// The notification after logging (with Undo). Swipe it down or sideways to get it out of the way (TF-67);
// dismissing keeps the change, like letting it time out. A drag never counts as a tap on Undo.
function ToastCard({ toast }: { toast: ToastValue }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [phase, setPhase] = useState<'rest' | 'drag' | 'away'>('rest')
  const start = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)

  function away(x: number, y: number) {
    setPhase('away')
    setOffset({ x: x === 0 ? 0 : Math.sign(x) * 480, y: x === 0 ? 160 : y })
    setTimeout(dismissToast, 160)
  }

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (phase === 'away') return
      start.current = { x: e.clientX, y: e.clientY }
      dragged.current = false
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      if (!dragged.current) {
        if (Math.hypot(dx, dy) < MOVE) return
        dragged.current = true
        setPhase('drag')
        e.currentTarget.setPointerCapture(e.pointerId)   // keep the drag even off the card; Undo won't get the click
      }
      setOffset({ x: dx, y: Math.max(0, dy) })   // down or sideways only
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      start.current = null
      if (!dragged.current) return
      if (Math.abs(dx) > AWAY_X) away(dx, Math.max(0, dy))
      else if (dy > AWAY_Y) away(0, dy)
      else { setPhase('rest'); setOffset({ x: 0, y: 0 }) }
    },
    onPointerCancel: () => { start.current = null; setPhase('rest'); setOffset({ x: 0, y: 0 }) },
  }

  return (
    <div
      className={`toast ${phase}`} role="status" {...handlers}
      style={{
        transform: `translateX(calc(-50% + ${offset.x}px)) translateY(${offset.y}px)`,
        opacity: phase === 'away' ? 0 : 1 - Math.min(Math.abs(offset.x) / 300 + offset.y / 200, 0.6),
      }}
    >
      <span className="toast-msg">{toast.message}</span>
      <span className="toast-actions">
        {toast.undo && (
          <button onClick={() => { if (dragged.current) return; toast.undo!(); dismissToast() }}>Undo</button>
        )}
        <button className="toast-x" aria-label="Dismiss" onClick={() => { if (!dragged.current) away(0, 0) }}>✕</button>
      </span>
    </div>
  )
}
