import { useState } from 'react'
import { logMeal, useStore } from '../data/store'
import { addDays, fmtDate, fmtDay } from '../lib/dates'
import { useDay } from '../lib/dayContext'
import { mealFoods, recentMeals } from '../lib/meals'

// "Repeat a meal" on the Food tab (TF-59): recent meals of 2+ foods, logged again in one tap to the day being viewed
export default function RepeatMeal() {
  const store = useStore()
  const { day } = useDay()
  const [open, setOpen] = useState(false)
  const meals = recentMeals(store.protein, addDays(day, -7))
  if (!meals.length) return null
  const when = (d: string) => (d === day ? 'Today' : d === addDays(day, -1) ? 'Yesterday' : `${fmtDay(d)} ${fmtDate(d)}`)

  return (
    <>
      <button className="row disclose" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Repeat a meal <span className="cap">({meals.length})</span></span>
        <span aria-hidden="true" className="chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="list">
          {meals.map((m) => (
            <div key={m.key} className="card meal-card">
              <span className="row-main">
                <span><b>{m.name}</b> <span className="cap">· {when(m.date)}</span></span>
                <span className="cap meal-foods">{mealFoods(m)}</span>
                <span className="cap">{m.grams} g protein{m.kcal != null ? ` · ${m.kcal} kcal` : ''}</span>
              </span>
              <button className="btn ghost small" onClick={() => { logMeal(m.name, m.entries, day); setOpen(false) }}>Log again</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
