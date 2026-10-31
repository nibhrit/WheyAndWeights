import { useEffect, useRef, useState } from 'react'
import { createDetector } from '../lib/barcode'
import { validBarcode } from '../lib/packaged'

type Props = { onCode: (code: string) => void; onClose: () => void }

// Full-screen camera view that reads a product barcode, then closes itself (TF-38).
// The camera stops as soon as a valid barcode is read, on Cancel, and when this screen goes away.
export default function Scanner({ onCode, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [message, setMessage] = useState<string | null>(null)
  const done = useRef(onCode)
  useEffect(() => { done.current = onCode }, [onCode])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const stop = () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()) }
    const fail = (m: string) => { if (stopped) return; stop(); setStatus('error'); setMessage(m) }

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) return fail('This browser can’t use the camera. Search by name, or type from the label.')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        })
      } catch (e) {
        const name = (e as DOMException).name
        return fail(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access is off. On iPhone: Settings → Apps → Safari → Camera → Allow, then reopen the app and try again.'
          : name === 'NotFoundError' ? 'No camera found on this device.' : 'Couldn’t start the camera. Try again.')
      }
      if (stopped) return stop()
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      let detector
      try { detector = await createDetector() } catch {
        return fail(navigator.onLine ? 'Couldn’t load the barcode reader. Try again.' : 'The barcode reader needs signal the first time. Try again with signal.')
      }
      if (stopped) return
      setStatus('scanning')
      let busy = false
      timer = window.setInterval(async () => {
        if (busy || stopped || v.readyState < 2) return
        busy = true
        try {
          const found = await detector.detect(v)
          const code = found.map((b) => b.rawValue.trim()).find(validBarcode)
          if (code && !stopped) {
            navigator.vibrate?.(60)
            stop()
            done.current(code)
          }
        } catch { /* a frame that couldn't be read: try the next one */ }
        busy = false
      }, 200)
    })()
    return stop
  }, [])

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <video ref={video} className="scanner-video" playsInline muted autoPlay />
      <div className="scanner-frame" aria-hidden="true" />
      <div className="scanner-bar">
        <span>{status === 'error' ? message : status === 'starting' ? 'Starting the camera…' : 'Point at the barcode on the pack'}</span>
        <button className="btn ghost" onClick={onClose}>{status === 'error' ? 'Close' : 'Cancel'}</button>
      </div>
    </div>
  )
}
