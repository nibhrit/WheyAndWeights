import { useEffect, useState } from 'react'

// Loads the packaged-foods list on first use (like useFoods); null while loading
type Packaged = typeof import('../data/packaged')

let loaded: Packaged | null = null
const load = () => import('../data/packaged').then((m) => (loaded = m))

export function usePackaged(): Packaged | null {
  const [p, setP] = useState(loaded)
  useEffect(() => { if (!p) load().then(setP) }, [p])
  return p
}
