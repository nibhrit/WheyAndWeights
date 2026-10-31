import { useState } from 'react'
import type { FoodRef, Nutrients } from '../data/types'
import { labelEntry, type LabelInput } from '../lib/packaged'

// Type the numbers from a pack's nutrition label (TF-38): when a product isn't in Open Food Facts,
// its numbers are missing, or they look wrong. Labels print values per 100 g and often per serving too.

const FIELDS: [keyof Nutrients, string][] = [
  ['grams', 'Protein g'], ['kcal', 'kcal'], ['carbs_g', 'Carbs g'], ['fat_g', 'Fat g'], ['fiber_g', 'Fibre g'], ['added_sugar_g', 'Added sugar g'],
]

export type LabelStart = {
  name: string
  code: string | null
  per100?: Partial<Record<keyof Nutrients, number | null>>  // prefill (from Open Food Facts), per 100 g
  servingGrams?: number | null
}

type Props = LabelStart & {
  submitLabel: string
  onSubmit: (n: Nutrients, ref: FoodRef, name: string) => void
  onCancel: () => void
  intro?: React.ReactNode
}

const text = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 10) / 10))
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

export default function LabelForm({ name: initialName, code, per100, servingGrams, submitLabel, onSubmit, onCancel, intro }: Props) {
  const [name, setName] = useState(initialName)
  const [basis, setBasis] = useState<LabelInput['basis']>('per100')
  const [serving, setServing] = useState(text(servingGrams))
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, text(per100?.[k])])))
  const [unit, setUnit] = useState<LabelInput['unit']>(servingGrams ? 'serving' : 'g')
  const [amount, setAmount] = useState(servingGrams ? '1' : '100')
  const [tried, setTried] = useState(false)

  const values = Object.fromEntries(FIELDS.map(([k]) => [k, toNum(vals[k] ?? '')])) as Record<keyof Nutrients, number | null>
  const bad = FIELDS.find(([k]) => values[k] != null && !(values[k]! >= 0 && values[k]! <= 5000))
  const result = bad ? { error: `Check ${bad[1].toLowerCase()}.` } : labelEntry({
    name, code, basis, servingGrams: toNum(serving), values: values as Nutrients,
    amount: toNum(amount) ?? NaN, unit,
  })

  return (
    <form className="card form" noValidate onSubmit={(e) => {
      e.preventDefault(); setTried(true)
      if ('n' in result) onSubmit(result.n, result.ref, name.trim())
    }}>
      <div className="card-top"><b>From the pack label</b>{code && <span className="cap">Barcode {code}</span>}</div>
      {intro && <p className="cap note">{intro}</p>}
      <input className="full" aria-label="Name" placeholder="Name, e.g. Yoga Bar protein bar" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="label-row">
        <span className="cap">Numbers on the label are per</span>
        <div className="seg small" role="group" aria-label="Label values are per">
          <button type="button" className="pick" aria-pressed={basis === 'per100'} onClick={() => setBasis('per100')}>100 g</button>
          <button type="button" className="pick" aria-pressed={basis === 'serving'} onClick={() => setBasis('serving')}>serving</button>
        </div>
      </div>
      <label className="label-row">
        <span className="cap">Serving size, g {basis === 'per100' && '(optional)'}</span>
        <input className="num small-input" inputMode="decimal" aria-label="Serving size in grams" placeholder="–" value={serving} onChange={(e) => setServing(e.target.value)} />
      </label>

      <div className="ai-grid">
        {FIELDS.map(([k, label]) => (
          <label key={k} className={k === 'grams' ? 'tone-protein' : undefined}>
            <span className="cap">{label}</span>
            <input className="num" inputMode="decimal" aria-label={label} placeholder="–" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="cap note">Leave a box empty if the label doesn’t show it. Protein or kcal is enough.</p>

      <div className="label-row">
        <span className="cap">How much you had</span>
        <span className="label-amount">
          <input className="num small-input" inputMode="decimal" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span className="seg small" role="group" aria-label="Amount in">
            <button type="button" className="pick" aria-pressed={unit === 'serving'} onClick={() => { setUnit('serving'); setAmount('1') }}>servings</button>
            <button type="button" className="pick" aria-pressed={unit === 'g'} onClick={() => { setUnit('g'); setAmount(serving || '100') }}>grams</button>
          </span>
        </span>
      </div>

      {'n' in result ? (
        <div className="food-preview" aria-live="polite">
          <span><span className="num tone-protein">{result.n.grams}</span> <span className="cap">g protein</span></span>
          <span><span className="num">{result.n.kcal ?? '–'}</span> <span className="cap">kcal</span></span>
        </div>
      ) : (tried || name.trim()) && <p className="err" role="alert">{result.error}</p>}

      <div className="two">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn">{submitLabel}</button>
      </div>
    </form>
  )
}
