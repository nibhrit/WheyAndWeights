# Whey & Weights

A mobile-first fitness tracker for people who lift. It answers three everyday questions:

- **What weight did I use last time?** Pick an exercise at the gym and see your last session's weights per set, in kg or lb.
- **Have I had enough protein today?** Log meals in one tap and watch a ring fill toward your daily goal.
- **Am I cutting sugar and junk food?** Check both off at the end of the day and see your clean days for the week.

It also tracks body weight over time and shows how consistently you log.

**Live app:** https://nibhrit.github.io/WheyAndWeights/ *(in development)*

## Product docs

- [PRD](product/PRD.md): problem, goals, metrics, requirements, data model, decisions
- [Design direction](product/DESIGN.md): the "Chalk and plate" visual system
- [Clickable prototype](product/prototype.html)

## Food data

Nutrition data: USDA FoodData Central (U.S. Department of Agriculture, Agricultural Research Service; public domain, CC0 1.0), https://fdc.nal.usda.gov. Dish values are Whey & Weights standard recipes calculated from these ingredients; some foods are Whey & Weights estimates. Values are approximate and are not medical advice. Methodology: [product/FOOD_DATA.md](product/FOOD_DATA.md).

Packaged foods: [Open Food Facts](https://world.openfoodfacts.org), looked up live by barcode or name (database under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/), contents under the Database Contents License). Not copied into the app's food list.

## Stack

| Layer | Choice |
|---|---|
| App | React + TypeScript (Vite), installable as a PWA |
| Data and login | Supabase (Postgres, magic-link auth, row-level security) |
| Hosting | GitHub Pages via GitHub Actions |

## Run locally

```bash
cd app
npm install
npm run dev
```

## Status

v1 in progress. Work is tracked on a Jira Kanban board; commits reference ticket keys (e.g. `TF-5`).
