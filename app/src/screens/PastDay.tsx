import { cardioOn, habitsOn, proteinOn, useStore } from '../data/store'
import { cardioName, effortName, type HabitResult } from '../data/types'
import { fmtSets, macroLine, timeOf } from '../lib/format'
import { portionText } from '../lib/nutrition'
import { HabitsTile, KcalTile, ProteinTile } from '../components/DayTiles'

const habitText = (r: HabitResult | null) => (r === 'avoided' ? 'Avoided' : r === 'had' ? 'Had it' : 'Not logged')

// A past day from Today's date picker. Read-only: what was logged, nothing to edit.
export default function PastDay({ date }: { date: string }) {
  const store = useStore()
  const lifts = store.sessions
    .filter((x) => x.local_date === date)
    .sort((a, b) => a.performed_at.localeCompare(b.performed_at))
  const cardio = cardioOn(store, date)
  const food = proteinOn(store, date)
  const habits = habitsOn(store, date)
  const weight = store.weights.find((w) => w.date === date)
  const nameOf = (id: string) => store.exercises.find((e) => e.id === id)?.name ?? 'Exercise'
  const empty = !lifts.length && !cardio.length && !food.length && !habits.sugar && !habits.junk_food && !weight

  return (
    <>
      <div className="tiles food">
        <ProteinTile date={date} />
        <KcalTile date={date} />
        <HabitsTile date={date} />
      </div>

      {empty && <p className="cap empty">Nothing was logged on this day.</p>}

      {lifts.length > 0 && (
        <section className="group">
          <h2 className="sec">Lifts</h2>
          <div className="list">
            {lifts.map((x) => (
              <div key={x.id} className="row">
                <span className="row-main">
                  <span>{nameOf(x.exercise_id)}</span>
                  <span className="cap">{x.sets.length} {x.sets.length === 1 ? 'set' : 'sets'}</span>
                </span>
                <span className="num row-weights">{fmtSets(x.sets)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {cardio.length > 0 && (
        <section className="group">
          <h2 className="sec">Cardio</h2>
          <div className="list">
            {cardio.map((c) => (
              <div key={c.id} className="row">
                <span className="row-main">
                  <span>{cardioName(c.kind)}</span>
                  <span className="cap">{effortName(c.effort)}</span>
                </span>
                <span className="num row-weights">{c.minutes} min</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {food.length > 0 && (
        <section className="group">
          <h2 className="sec">Food</h2>
          <div className="list">
            {food.map((e) => {
              const portion = portionText(e)
              return (
                <div key={e.id} className="row">
                  <span className="row-main">
                    <span>{e.label ?? 'Protein'}</span>
                    <span className="cap">{portion ? `${portion} · ` : ''}{timeOf(e.logged_at)}</span>
                    {macroLine(e) && <span className="cap">{macroLine(e)}</span>}
                  </span>
                  <span className="row-nums">
                    <span className="num">{e.grams} g</span>
                    {e.kcal != null && <span className="cap">{e.kcal} kcal</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {(habits.sugar || habits.junk_food || weight) && (
        <section className="group">
          <h2 className="sec">End of day</h2>
          <div className="card form">
            <div className="hdr"><span>Sugar</span><span className="cap">{habitText(habits.sugar)}</span></div>
            <div className="hdr"><span>Junk food</span><span className="cap">{habitText(habits.junk_food)}</span></div>
            {weight && <div className="hdr"><span>Body weight</span><span className="num">{weight.weight} {weight.unit}</span></div>}
          </div>
        </section>
      )}
    </>
  )
}
