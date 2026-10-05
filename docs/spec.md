# Templog — product and technical spec (batch 4, app 12)

Date: 2026-10-06. Free app. Copied into the `templog` repo as `docs/spec.md`.

## 1. Problem and users

Small kitchens (independent restaurants, cafés, food trucks, caterers, school and care kitchens) must log hot-holding, cold-holding and cooling temperatures to satisfy the FDA Food Code (3-501.14 two-stage cooling: 135→70 °F within 2 h, then →41 °F within the following 4 h; 3-501.16 holding: hot ≥135 °F, cold ≤41 °F) and local inspectors. Most still use paper sheets that get lost or filled in from memory; staff forget checks. Digital tools exist but are SaaS priced for chains: ThermoWorks from $9/mo, Zip HACCP $59.99/location/mo, FoodDocs from $84/mo, Jolt needs training.

**Templog** is a free, offline-first temperature log for one kitchen: checkpoints with a schedule, reminders that reach the line (push, widget, Live Activity), cooling timers that count the FDA stages on the Lock Screen, corrective actions, and a PDF the inspector accepts.

## 2. Scope (v0.1)

- Kitchen setup: name, time zone, unit (°F/°C), checkpoints (walk-in fridge, reach-in, hot well, soup kettle, …) with type `cold-holding` | `hot-holding` | `cooking` | `receiving`, target limits (defaults from the Food Code, editable), and a check schedule (every N hours within opening hours, or fixed times).
- Logging: one-tap reading entry (big numeric keypad, recent readings, initials of the person logging), pass/fail decided by rules, mandatory corrective action on fail (discard, reheat, move product, call service) with free text.
- **Cooling timers**: start when food comes off heat; two-stage countdown; prompts for the 2-hour reading (must be ≤70 °F) and the 6-hour reading (≤41 °F); auto-fail with corrective action when a stage is missed; multiple concurrent items. Live Activity (iOS) / Live Update (Android 16) shows item, stage, time left, next reading due; buttons "Log reading" and "Discarded".
- Reminders: local notifications for due checks (category `check` with "Log now" / "Snooze 15"), overdue escalation badge; widgets: next check due + today's compliance %; Lock-Screen circular with minutes to next check.
- Records: day view (timeline of readings with pass/fail), checkpoint history with sparkline, missed checks shown explicitly (never silently filled).
- Export: inspector PDF per day/week/month (kitchen header, checkpoints, readings, failures + corrective actions, signatures/initials) and CSV, via share sheet.
- Team: optional account → create kitchen → join code; readings sync across phones; owner sees who logged what; weekly summary push to the owner (Monday).
- Privacy: readings are not personal data; initials only, no accounts required for solo use.
- Free, no ads.

Out of scope: Bluetooth thermometer probes, multi-kitchen chains, HACCP plan generation, offline PDF signing.

## 3. Architecture

Same monorepo shape as Dosely (`apps/mobile`, `apps/web`, `packages/shared`).

### Domain (`packages/shared`)
- `limits.ts`: Food Code defaults, `evaluateReading(checkpoint, reading, unit)` → pass/fail with reason; unit conversion exact to 0.1.
- `cooling.ts`: cooling state machine (`started → stage1Due → stage1Pass|stage1Fail → stage2Due → done|fail`), `coolingDeadlines(startedAt)`, `nextCoolingPrompt`.
- `schedule.ts`: check expansion from opening hours and cadence, DST-safe; `missedChecks(checks, readings, now)`.
- `compliance.ts`: daily/weekly compliance %, per-checkpoint stats, streak of fully logged days.
- `report.ts`: PDF/CSV view models.
- `sync.ts`, `ids.ts`, `tz.ts`, `csv.ts` as in the siblings.

### Mobile
Tabs: Today · Log · Cooling · History · Settings. Identity: "stainless and heat" — cool steel surfaces (`#0F1416` dark / `#F2F4F5` light), heat orange-red accent for fails and timers, cold blue for cold holding; big tabular numerals; keypad-first logging; glass "due now" card. Native: notifications (`check` category), expo-widgets `NextCheck` widget + `Cooling` Live Activity, expo-live-updates, react-native-android-widget, SQLite (Drizzle), expo-print/sharing, background task for daily expansion.

### Backend (`apps/web`)
Landing (free; problem: paper logs and $60/mo SaaS; FDA facts), privacy, support, terms. API: Better Auth (Expo plugin), `kitchens` (create/join/leave), `sync/push|pull` (checkpoints, readings, cooling items), `devices`, `cron/daily` (keep-alive + Monday owner summary), `health`. Schema `templog` on Neon.

## 4. Verification
Vitest on limits/cooling/schedule/compliance (TDD); API tests; `expo-doctor`, exports; Android device pass; Mac pass.
