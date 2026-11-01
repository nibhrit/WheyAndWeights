import type { Meal } from '../data/types'
import { MEALS } from '../lib/meals'

// Breakfast / Lunch / Snacks / Dinner (TF-63): which meal a food goes to
export default function MealPicker({ value, onChange, label = 'Meal' }: { value: Meal; onChange: (m: Meal) => void; label?: string }) {
  return (
    <div className="meal-picker" role="group" aria-label={label}>
      <span className="cap">{label}</span>
      <div className="chips">
        {MEALS.map(([id, name]) => (
          <button key={id} type="button" className="chip small-chip" aria-pressed={value === id} onClick={() => onChange(id)}>{name}</button>
        ))}
      </div>
    </div>
  )
}
