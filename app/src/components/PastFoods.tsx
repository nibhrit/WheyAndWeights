import { useState } from 'react'
import { logAgain, useStore } from '../data/store'
import type { Meal } from '../data/types'
import { addDays } from '../lib/dates'
import { useDay } from '../lib/dayContext'
import { mealName, pastItems } from '../lib/meals'
import { portionText } from '../lib/nutrition'

const SHOWN = 6        // then "Show more"
const MORE = 20
const LOOK_BACK_DAYS = 60

// "Had at breakfast before" on the Food tab (TF-68): foods you've eaten at the meal you're logging to, one tap each
// (same portion as last time; change it after in the entry). Replaces "Repeat a meal" (TF-59).
// Collapsed by default, so today's entries stay near the top.
export default function PastFoods({ meal }: { meal: Meal }) {
  const store = useStore()
  const { day } = useDay()
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const items = pastItems(store.protein, meal, day, addDays(day, -LOOK_BACK_DAYS))
  if (!items.length) return null
  const shown = items.slice(0, all ? MORE : SHOWN)

  const title = `Had at ${mealName(meal).toLowerCase()} before`

  return (
    <>
      <button className="row disclose" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title} <span className="cap">({items.length})</span></span>
        <span aria-hidden="true" className="chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <section className="group" aria-label={title}>
          <div className="list">
            {shown.map(({ key, entry: e }) => {
              const portion = portionText(e)
              return (
                <button key={key} className="row" onClick={() => logAgain(e, day, meal)} aria-label={`Log ${e.label ?? 'Protein'}${portion ? `, ${portion}` : ''}`}>
                  <span className="row-main">
                    <span>{e.label ?? 'Protein'}</span>
                    <span className="cap">{portion ? `${portion} · ` : ''}{e.grams} g protein{e.kcal != null ? ` · ${e.kcal} kcal` : ''}</span>
                  </span>
                  <span className="add-plus" aria-hidden="true">+</span>
                </button>
              )
            })}
          </div>
          {items.length > SHOWN && (
            <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show more (${Math.min(items.length, MORE) - SHOWN})`}
            </button>
          )}
        </section>
      )}
    </>
  )
}
