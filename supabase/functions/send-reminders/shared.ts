// Pure logic for send-reminders: which reminders are due, and what to say (tested in app/tests/food.test.ts).

export type Kind = 'food' | 'protein' | 'workout'
export const KINDS: Kind[] = ['workout', 'protein', 'food']   // in time order of the defaults
export const WINDOW_MIN = 90       // a reminder can go out up to 90 minutes after its time (the job runs every 15)
export const MIN_FOODS = 2         // same rule as the app's evening nudge

export type Settings = {
  time_zone: string
  food_on: boolean; food_at: string           // "21:00:00"
  protein_on: boolean; protein_at: string
  workout_on: boolean; workout_at: string
}

// The person's local date ("2026-11-01") and minutes since local midnight, in their time zone
export function localNow(timeZone: string, now = new Date()): { date: string; minutes: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

// Reminders switched on whose time has come (within the window) and that weren't sent today
export function dueKinds(s: Settings, minutes: number, sentToday: Kind[]): Kind[] {
  return KINDS.filter((k) => {
    if (!s[`${k}_on`] || sentToday.includes(k)) return false
    const at = toMinutes(s[`${k}_at`])
    return minutes >= at && minutes < at + WINDOW_MIN
  })
}

export type Facts = { foods: number; protein: number; goal: number; planned: boolean; trained: boolean }
export type Message = { title: string; body: string; url: string; tag: Kind }

const APP = '/WheyAndWeights/'

// What to send, or null when the reminder isn't needed any more (the condition is already met)
export function messageFor(kind: Kind, f: Facts): Message | null {
  if (kind === 'food') {
    if (f.foods >= MIN_FOODS) return null
    return {
      title: 'Log your food', tag: kind, url: `${APP}?tab=protein`,
      body: f.foods === 0 ? 'Nothing logged today yet. Add your meals so calories and protein are right.'
        : 'Only 1 food logged today. Add the rest so calories and protein are right.',
    }
  }
  if (kind === 'protein') {
    if (f.protein >= f.goal) return null
    return {
      title: 'Protein check', tag: kind, url: `${APP}?tab=protein`,
      body: `${f.protein} of ${f.goal} g so far, ${f.goal - f.protein} g to go.`,
    }
  }
  if (!f.planned || f.trained) return null
  return { title: 'Workout day', tag: kind, url: `${APP}?tab=lift`, body: 'Today’s split is planned and nothing is logged yet.' }
}
