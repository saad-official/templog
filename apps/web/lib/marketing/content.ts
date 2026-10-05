/** Copy and facts used across the marketing pages. Keep every claim checkable. */

export const SUPPORT_EMAIL = "saad.khan+templog@zortik.com";
export const POLICY_UPDATED = "6 October 2026";
export const FDA_FOOD_CODE_URL = "https://www.fda.gov/food/retail-food-protection/fda-food-code";

export const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#free", label: "Why free" },
  { href: "/food-code", label: "Food Code" },
  { href: "/support", label: "Support" },
] as const;

export const STEPS = [
  {
    title: "Set your checkpoints",
    body: "Walk-in, reach-ins, the hot well, the soup kettle, deliveries. Each one starts with the FDA Food Code limit for its type and a schedule: every few hours while you are open, or at fixed times. Change either whenever your plan says otherwise.",
  },
  {
    title: "Get reminded",
    body: "When a check comes due, the phone on the line says so: a notification with Log now and Snooze 15, a widget with the next check, and a badge when something is overdue. Reminders stay quiet outside your opening hours.",
  },
  {
    title: "Log in two taps",
    body: "Tap the reminder, type the number on a big keypad, done. Templog decides pass or fail from your limits. A fail asks what you did about it (discard, reheat, move the product, call for service) before it saves.",
  },
  {
    title: "Export the PDF",
    body: "One page per day, week or month: your kitchen, every checkpoint, every reading with time and initials, every failure with its corrective action, and the checks that were missed. Print it, email it, or hand over the phone.",
  },
] as const;

export const INCUMBENTS = [
  { name: "ThermoWorks (cloud logging)", price: "from $9 a month" },
  { name: "Zip HACCP", price: "$59.99 per location, per month" },
  { name: "FoodDocs", price: "from $84 a month" },
] as const;

export const FAQ = [
  {
    q: "Is it really free? What is the catch?",
    a: "There is no paid tier, no ads and no data sale. Templog runs on free hosting tiers and the phone does almost all of the work, so it costs very little to run. If that ever changes, the logging you rely on stays free.",
  },
  {
    q: "Will my inspector accept it?",
    a: "Inspectors look for complete, honest records: what was checked, when, by whom, and what you did when something was out of range. The Templog PDF shows exactly that, including the checks nobody logged. Whether a digital log satisfies your jurisdiction is up to your local health department, so ask them if you are unsure.",
  },
  {
    q: "Does it work without signal?",
    a: "Yes. Everything is stored on the phone first. Reminders, cooling timers and the PDF all work in a basement walk-in or a truck with no reception. A shared kitchen syncs when the phone is back online.",
  },
  {
    q: "Do my staff need accounts?",
    a: "Not for a one-phone kitchen: no account at all. For a shared kitchen, the owner signs in and creates a join code, and each person who joins signs in once on their phone. Readings record initials, not names.",
  },
  {
    q: "Does it connect to Bluetooth thermometers?",
    a: "Not yet. You type the reading from the thermometer you already use. Probe support is something we may add later.",
  },
  {
    q: "Does it write my HACCP plan?",
    a: "No. Templog keeps your temperature records. Your HACCP plan, and your local health code, decide what you have to check and what to do about a failure.",
  },
  {
    q: "Celsius?",
    a: "Yes. Each kitchen picks °F or °C. Readings are converted exactly, to a tenth of a degree, so the record does not drift.",
  },
] as const;
