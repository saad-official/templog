# Templog

A free food-safety temperature log for small kitchens. Templog schedules your holding checks (walk-in, reach-ins, hot well, soup kettle, deliveries), reminds the line when one is due, logs a reading in two taps with pass or fail decided by FDA Food Code limits, runs two-stage cooling timers on the Lock Screen, and exports a PDF your inspector can read. Offline-first: everything lives on the phone unless you share a kitchen with your staff. No subscription, no ads.

**Why it exists.**
- The FDA Food Code sets the rules every US kitchen is inspected against: hot holding at 135 °F or above and cold holding at 41 °F or below (3-501.16), and two-stage cooling from 135 °F to 70 °F within 2 hours and to 41 °F within 6 hours in total (3-501.14).
- Most small kitchens still log on paper: sheets get lost, and readings get filled in from memory at closing.
- The digital tools are priced for chains: ThermoWorks cloud logging from $9 a month, Zip HACCP $59.99 per location per month, FoodDocs from $84 a month.

Landing site: [gettemplog.vercel.app](https://gettemplog.vercel.app). Product and technical spec: [`docs/spec.md`](docs/spec.md). The rules in plain language: [`/food-code`](https://gettemplog.vercel.app/food-code).

## Monorepo layout

```
apps/mobile       Expo SDK 57 app (expo-router, SQLite, notifications, cooling Live Activity / Live Update, widgets, PDF export)
apps/web          Next.js 16: marketing site + API (Better Auth with Expo plugin, shared kitchens, sync, Monday owner summary push, cron)
packages/shared   Pure TypeScript: Food Code limits, cooling state machine, check schedule, compliance, reports, zod schemas, design tokens
docs/             Spec
```

pnpm 12 workspace with a hoisted `node_modules` (Metro needs it; see `pnpm-workspace.yaml`). Node 24 (`.nvmrc`).

## Run it

```bash
pnpm install                 # from the repo root

# Web: landing site + API on http://localhost:3800
pnpm web                     # same as: pnpm --filter web dev
```

The web app needs no setup locally: without `DATABASE_URL` it runs an embedded Postgres (PGlite) in `apps/web/.pglite/`, migrated on first use, with a public development auth secret. Copy `apps/web/.env.example` to `apps/web/.env.local` to use Neon or real secrets; `bash apps/web/scripts/setup-env.sh` (Git Bash) pushes production secrets to Vercel and runs migrations (`pnpm --filter web db:migrate`).

```bash
# Mobile: development build (Expo Go cannot load the native modules)
cd apps/mobile
npx expo run:android --device   # Android phone over USB
npx expo start                  # Metro for an installed dev build
```

Install Expo libraries with `npx expo install <pkg>` inside `apps/mobile`, never `pnpm add`.

## API (apps/web)

Every route except health and cron needs a Better Auth session (the Expo client sends the `templog.session_token` cookie); without one the answer is `401`. Bodies are JSON, validated with zod (`400` on a mismatch). Row shapes are the shared schemas in `packages/shared/src/schemas.ts`.

| Route | What it does |
| --- | --- |
| `POST/GET /api/auth/*` | Better Auth: email + password sign-up and sign-in, session, `delete-user` (cascades the owned kitchen, memberships and devices) |
| `POST /api/kitchens` | Share a kitchen: `{ id?, name, tz, unit, openingHours, displayName?, initials? }` → `201 { kitchen }` with the 8-character invite code (one owned kitchen per account; a repeat returns it with `200`) |
| `GET /api/kitchens` | Kitchens I own or work in, with members |
| `POST /api/kitchens/join` | `{ code, displayName?, initials? }` → join as staff (`404` unknown code, `409` own kitchen or full) |
| `DELETE /api/kitchens/:id/members/:userId` | Owner removes staff; staff remove themselves (`403` otherwise, owner cannot leave) |
| `DELETE /api/kitchens/:id` | Owner deletes the kitchen and every row synced for it |
| `GET /api/kitchens/:id/today?date=` | Owner/staff view: checkpoints with latest reading and next check, due/overdue/missed counts, today's fails, open cooling items |
| `POST /api/sync/push` | `{ deviceId, tables: { kitchens, checkpoints, readings, coolingItems } }`, last-write-wins on `updatedAt`/`deletedAt`; every row's kitchen must be one I belong to (`403 not_a_member`) |
| `GET /api/sync/pull?since=&kitchenId=` | Rows of my kitchens changed after `since`, tombstones included; `serverTime` is the next cursor |
| `POST /api/devices`, `DELETE /api/devices/:token` | Register / remove an Expo push token |
| `GET /api/cron/daily` | `Authorization: Bearer $CRON_SECRET`; keep-alive, and on Mondays the weekly summary push to each owner (rate, fails, most-missed checkpoint) |
| `GET /api/health` | Liveness, no database |

## Checks

```bash
pnpm lint                            # every workspace
pnpm typecheck                       # web runs `next typegen` first
pnpm test                            # Vitest: shared domain, tokens, web API against in-memory PGlite
pnpm build:web                       # next build
```

CI (`.github/workflows/ci.yml`) runs the same steps on every push to `main` and every pull request.

## Testing on a device

**Android over USB.** Turn on Developer options and USB debugging, plug the phone in, accept the RSA prompt and check that `adb devices` lists it. Then `cd apps/mobile && npx expo run:android --device`. Live Updates for cooling timers need Android 16; earlier versions still get actionable notifications and widgets. To reach the local API from the phone, run `adb reverse tcp:3800 tcp:3800` so `http://localhost:3800` on the phone resolves to your computer. Guides: [Expo: run on a device](https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=physical&mode=development-build), [Android: run apps on a hardware device](https://developer.android.com/studio/run/device).

**iPhone (on a Mac).** Live Activities, the Dynamic Island, time-sensitive notifications and iOS widgets need Xcode and a real device or simulator: [Expo: iOS development build](https://docs.expo.dev/get-started/set-up-your-environment/?platform=ios&device=physical&mode=development-build), [Expo: iOS simulator](https://docs.expo.dev/workflow/ios-simulator/).

## Status (v0.1)

| Area | State |
| --- | --- |
| Shared domain (`packages/shared`): limits, cooling, schedule, compliance, reports, schemas, sync | Done (separate workstream) |
| Design tokens (`packages/shared/src/tokens.ts`) | Done; WCAG AA contrast checked in both schemes |
| Web API: auth, shared kitchens, today view, sync push/pull, devices, daily cron + Monday owner summary | Done, tested on PGlite |
| Marketing site: home, Food Code page, privacy, terms, support | Done |
| Mobile app: screens, reminders, cooling Live Activity / Live Update, widgets, PDF | In progress |
| TestFlight and Google Play betas | Not started |
| Production deploy (Vercel + Neon) | Not started: run `apps/web/scripts/setup-env.sh` once the Neon database exists |

Templog helps you keep records; it is not a substitute for your local health code or HACCP plan.
