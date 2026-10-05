# Testing Templog on a Mac (iOS)

The iOS-only surfaces (cooling Live Activities, Dynamic Island, `NextCheck` home / Lock Screen
widgets, time-sensitive notification actions) cannot be built on the Windows dev box. This is the
owner's checklist for a Mac with Xcode and an iPhone.

## What needs a paid Apple Developer account

| Feature | Free Apple ID (personal team) | Paid program ($99/yr) |
|---|---|---|
| App on your own iPhone via Xcode (7-day profile) | yes | yes |
| Local check reminders with Log now / Snooze 15, cooling prompts with Log reading / Discarded | yes | yes |
| Time-sensitive delivery (`com.apple.developer.usernotifications.time-sensitive`) | **no**: remove the entitlement from `app.json` `ios.entitlements` to build | yes |
| Live Activity / Dynamic Island (`Cooling`) | yes (lives in the widget extension, see below) | yes |
| Home / Lock Screen widget (`NextCheck`, App Group `group.com.saadofficial.templog`) | **no**: App Groups need a paid team | yes |
| Shared kitchen push (weekly owner summary, Expo push token) | no | yes |
| `eas build -p ios` (any profile), TestFlight | no | yes |

With a free team, temporarily remove the `expo-widgets` plugin entry and the time-sensitive
entitlement from `apps/mobile/app.json` to try everything else (the Live Activity is part of the
widget extension, so it goes with it).

## One-time setup

1. Xcode 26+ from the App Store, then `xcode-select --install` and open Xcode once to install
   components. iPhone on iOS 17+ (Live Activity buttons need 17), with **Developer Mode** on
   (Settings → Privacy & Security).
2. Node 24 and pnpm 12: `brew install node@24 && corepack enable && corepack prepare pnpm@12.8.1 --activate`.
3. CocoaPods: `brew install cocoapods`.
4. In Xcode → Settings → Accounts, sign in with the Apple ID / team you will sign with. Add the Team
   ID to `apps/mobile/app.json` as `"ios": { "appleTeamId": "XXXXXXXXXX", ... }` (the widget extension
   target `com.saadofficial.templog.widgets` is signed with it).

## Build and run on the device

```sh
git clone <templog repo url> templog
cd templog
pnpm install
cd apps/mobile
echo "EXPO_PUBLIC_API_URL=https://gettemplog.vercel.app" > .env.local   # or http://<mac-ip>:3800 for a local API
npx expo prebuild --platform ios                 # generates ios/ with ExpoWidgetsTarget
npx expo run:ios --device                        # pick the iPhone; first build ~10 min
```

If signing fails, open `ios/Templog.xcworkspace`, select both the `Templog` and `ExpoWidgetsTarget`
targets → Signing & Capabilities → choose your team (keep "Automatically manage signing"), then
re-run `npx expo run:ios --device`. On first launch trust the developer profile on the phone
(Settings → General → VPN & Device Management).

After that, JS changes hot-reload from `npx expo start`; re-run `expo run:ios` only after native
changes (new native package or `app.json` plugin changes). Widget and Live Activity layouts are sent
from JS at runtime, so editing their TSX (`src/widgets/*`) usually needs no rebuild.

### Alternative: EAS cloud build (paid account)

```sh
npx eas-cli@latest login
npx eas-cli@latest init                          # writes extra.eas.projectId (needed for push tokens)
npx eas-cli@latest device:create                 # register the iPhone (ad hoc)
npx eas-cli@latest build -p ios --profile development
```

Install from the QR code / link EAS prints, then `npx expo start`. EAS asks to create the App Group
and the widget extension's bundle id on first build; accept. `--profile preview` makes a standalone
internal build.

## Test script

Seed data first: from a dev screen or the JS console call `seedDemoData()` (from `@/data`). It
creates "Corner Café" with Walk-in fridge (every 4 h), Reach-in 1 (09:00 / 15:00 / 20:00), Hot well
(every 2 h), Chest freezer and Deliveries, six days of readings (a few fails with corrective
actions, a few missed checks), and two cooling timers: "Chili (6 qt)" in stage 1 and "Rice" in
stage 2. To see a reminder quickly, set Settings → reminder lead to 0 and add a checkpoint with a
fixed time two minutes from now.

### Check reminders
1. Allow notifications at the priming prompt (badge included).
2. Lock the phone and wait for "Walk-in fridge check" (lead minutes before the check). It should
   break through a Focus that allows time-sensitive notifications (paid team).
3. Long-press it: **Log now** opens the app on `templog://log/<checkpointId>` with the keypad;
   **Snooze 15** re-delivers "Reminder: …" 15 minutes later without opening the app. Repeat Snooze
   with the app killed: it still applies (handled at JS entry, not by a screen).
4. Two checks at the same minute arrive as one notification ("2 checks due"); Log now opens Today.
5. Leave a check unlogged past the grace period (30 min): "Overdue: …" arrives and the app icon
   badge shows the open count; logging the check clears the badge.
6. With "quiet outside hours" on, set opening hours that exclude a fixed check time: no reminder.

### Cooling Live Activity and Dynamic Island
1. Settings → Templog → Live Activities must be on.
2. Start a cooling timer in the app (foreground): the `Cooling` activity shows the item, "Stage 1 ·
   ≤ 70 °F by 4:15 PM", a native countdown and a progress bar, and **Log reading** / **Discarded**.
   Two running items show two activities. On a Dynamic Island phone, go home: compact view shows
   the snowflake + countdown; long-press for the expanded view.
3. Tap **Log reading**: the app opens on `templog://cooling/<id>`. Log a value ≤ 70 °F: the activity
   switches to "Stage 2 · ≤ 41 °F" with the 6-hour deadline.
4. Tap **Discarded** on the Lock Screen: the item closes as discarded without opening the app and its
   activity ends.
5. Kill the app and relaunch: the same activities are adopted (no duplicates).
6. Let a stage deadline pass: the activity turns "Overdue" by itself at the deadline (stale date);
   the "stage missed" notification arrives; the item auto-fails the next time the app or the
   background task runs, and the activity ends.

### Widgets (paid team)
1. Long-press the home screen → + → Templog → add **Next check** small and medium; on the Lock
   Screen (Customize → Lock Screen → widgets) add the circular and inline ones.
2. They show the next check name, time and "in 25 min" / "overdue", plus today's compliance % ring;
   the circular one shows minutes to the next check.
3. Log a reading in the app: the widgets update within a few seconds. With the app closed, the
   widget moves to the next check on its own (timeline entries every 5 min and at each check).
4. Tapping a widget opens `templog://log/<checkpointId>` (or Today when nothing is due).

### Shared kitchen (paid team for push)
1. Sign up on the phone, share the kitchen, note the join code.
2. On a second device (or the Android app), sign up and join with the code: the checkpoints and
   readings appear after the first sync; readings logged on either phone appear on the other.
3. Monday morning (or the `cron/daily` endpoint run by hand) the owner receives the weekly summary
   push (Android channel `general`); tapping it opens `templog://history`.

## Troubleshooting

- **Widget shows "Unable to load"**: open the app once (the first snapshot is pushed on launch);
  check the App Group exists on both targets.
- **No Live Activity**: Settings → Templog → Live Activities; an activity can only *start* while the
  app is in the foreground (no push-to-start in v0.1); Low Power Mode delays updates.
- **Notification actions do nothing**: rebuild after plugin changes; the `check` / `cooling`
  categories are registered at launch (`setupNotifications`).
- **`pod install` errors after pulling**: `cd apps/mobile && npx expo prebuild --platform ios --clean`.
