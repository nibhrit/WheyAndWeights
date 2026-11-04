import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import SignIn from './screens/SignIn'
import Settings from './screens/Settings'
import Lift, { type LiftTarget } from './screens/Lift'
import Today from './screens/Today'
import Protein from './screens/Protein'
import Week from './screens/Week'
import Cardio from './screens/Cardio'
import Toast from './components/Toast'
import Celebration from './components/Celebration'
import { SettingsContext } from './lib/settingsContext'
import { DayContext, activeDay, dayLabel } from './lib/dayContext'
import { installEdgeSwipe, useBackStep } from './lib/backSteps'
import { clearUser, loadForUser, useStore } from './data/store'
import { localDate } from './lib/dates'

type Tab = 'today' | 'lift' | 'cardio' | 'protein' | 'week'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /> },
  { id: 'lift', label: 'Lift', icon: <path d="M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8" /> },
  { id: 'cardio', label: 'Cardio', icon: <path d="M3 12h4l2-5 4 10 2-5h6" /> },
  { id: 'protein', label: 'Food', icon: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 8 8" strokeWidth="3.2" /></> },
  { id: 'week', label: 'Week', icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
]

export default function App() {
  const session = useSession()
  // A reminder opens the app on a tab (?tab=protein); a reload (e.g. iOS going back past the first page) returns to
  // the tab you were on in this session; otherwise Today
  const [tab, setTabState] = useState<Tab>(() => {
    const t = new URLSearchParams(location.search).get('tab') ?? (() => { try { return sessionStorage.getItem('ww:tab') } catch { return null } })()
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'today'
  })
  const setTab = (t: Tab) => { setTabState(t); try { sessionStorage.setItem('ww:tab', t) } catch { /* private mode */ } }
  const [showSettings, setShowSettings] = useState(false)
  const [liftTarget, setLiftTarget] = useState<LiftTarget | null>(null)
  const userId = session?.user.id
  const { pending } = useStore()
  const mainRef = useRef<HTMLElement>(null)
  const [picked, setPicked] = useState<string | null>(null)   // a past day from Today's date; null = today
  const day = activeDay(picked)

  // Back to today after 5 minutes away, so nothing gets logged to an old day by accident
  useEffect(() => {
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) setPicked(null)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Phone back closes Settings; left-edge swipe works where the browser gives none (iPhone home-screen app)
  useBackStep(showSettings, () => setShowSettings(false))
  useEffect(() => installEdgeSwipe(), [])

  // Each tab opens at the top
  useEffect(() => { mainRef.current?.scrollTo(0, 0) }, [tab, showSettings])

  // First sign-in on any device: make sure the user's settings row exists (no-op afterwards).
  useEffect(() => {
    if (!userId) { clearUser(); return }
    supabase.from('user_settings').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
      .then(() => loadForUser(userId))
  }, [userId])

  useEffect(() => { if (!session) setShowSettings(false) }, [session])

  if (session === undefined) return <div className="app" aria-busy="true" />
  if (session === null) return <div className="app"><main><SignIn /></main></div>

  return (
    <SettingsContext.Provider value={() => setShowSettings(true)}>
    <DayContext.Provider value={{ day, setDay: setPicked }}>
    <div className="app">
      {picked && day === picked && !showSettings && tab !== 'week' && (
        <div className="day-banner" role="status">
          <span>Editing <b>{dayLabel(day)}</b></span>
          <button className="link" onClick={() => setPicked(null)}>Back to today</button>
        </div>
      )}
      <main ref={mainRef}>
        {pending > 0 && (
          <div className="sync" role="status">
            {pending === 1 ? '1 change' : `${pending} changes`} saved on this phone, waiting for signal
          </div>
        )}
        {showSettings ? (
          <Settings session={session} onClose={() => setShowSettings(false)} />
        ) : tab === 'lift' ? (
          <Lift target={liftTarget} />
        ) : tab === 'cardio' ? (
          <Cardio />
        ) : tab === 'protein' ? (
          <Protein />
        ) : tab === 'week' ? (
          <Week onOpenDay={(d) => { setPicked(d === localDate() ? null : d); setTab('today') }} />
        ) : (
          <Today
            onGoToLift={() => { setLiftTarget(null); setTab('lift') }}
            onGoToProtein={() => setTab('protein')}
          />
        )}
      </main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            aria-current={!showSettings && t.id === tab ? 'page' : undefined}
            onClick={() => { setTab(t.id); setShowSettings(false); setLiftTarget(null) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.icon}
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
      <Toast />
      {userId && <Celebration userId={userId} />}
    </div>
    </DayContext.Provider>
    </SettingsContext.Provider>
  )
}
