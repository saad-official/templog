import type { Metadata } from "next";
import Link from "next/link";
import { COOLING_LIMITS } from "@templog/shared/cooling";
import { FOOD_CODE_DEFAULTS, kindLabel, limitsLabel } from "@templog/shared/limits";
import type { CheckpointKind } from "@templog/shared/schemas";
import { formatTemp, toC } from "@templog/shared/units";
import { FDA_FOOD_CODE_URL } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "The Food Code rules Templog follows",
  description:
    "Hot and cold holding (3-501.16) and two-stage cooling (3-501.14) from the FDA Food Code, in plain language, and how Templog applies them.",
};

/** `135 °F (57.2 °C)`: both units, from the shared limits, never typed by hand. */
const both = (valueF: number) => `${formatTemp(valueF, "F")} (${formatTemp(toC(valueF), "C")})`;

const CITATIONS: Record<CheckpointKind, string> = {
  "cold-holding": "3-501.16(A)(2)",
  "hot-holding": "3-501.16(A)(1)",
  cooking: "3-401.11, 3-403.11",
  receiving: "3-202.11(A)",
  freezer: "3-501.11 (conventional target)",
};

export default function FoodCodePage() {
  const cold = FOOD_CODE_DEFAULTS["cold-holding"].max!;
  const hot = FOOD_CODE_DEFAULTS["hot-holding"].min!;
  const reheat = FOOD_CODE_DEFAULTS.cooking.min!;
  const c = COOLING_LIMITS;
  return (
    <article className="mx-auto max-w-6xl px-4 pt-14 sm:px-8">
      <div className="prose-doc">
        <h1 className="text-title font-bold sm:text-[36px] sm:leading-[42px]">The rules, in plain language</h1>
        <p className="mt-4">
          Templog&apos;s default limits and cooling timers come from the{" "}
          <a href={FDA_FOOD_CODE_URL}>FDA Food Code</a> (2022 edition), the model code most US states and counties base
          their retail food rules on. Section numbers below are from that edition. Your jurisdiction may have adopted a
          different edition or added its own rules, so treat this page as a summary, not legal advice.
        </p>

        <h2>Holding: keep it hot or keep it cold (3-501.16)</h2>
        <p>
          Food that needs time and temperature control for safety (TCS food: cooked meat, rice, beans, cut melons and
          leafy greens, dairy, cooked vegetables and so on) has to stay out of the range where bacteria grow fastest.
        </p>
        <ul>
          <li>
            <strong>Hot holding:</strong> {both(hot)} or above (3-501.16(A)(1)).
          </li>
          <li>
            <strong>Cold holding:</strong> {both(cold)} or below (3-501.16(A)(2)).
          </li>
        </ul>
        <p>
          In Templog, a hot-holding checkpoint fails below {formatTemp(hot, "F")} and a cold-holding checkpoint fails
          above {formatTemp(cold, "F")}. A fail cannot be saved without a corrective action: for example reheat, move the
          product to working equipment, call for service, or discard.
        </p>

        <h2>Cooling: two stages, six hours (3-501.14)</h2>
        <p>Cooked TCS food has to be cooled:</p>
        <ol>
          <li>
            <strong>Stage 1:</strong> from {both(c.startF)} to {both(c.stage1MaxF)} within {c.stage1Hours} hours, and
          </li>
          <li>
            <strong>Stage 2:</strong> to {both(c.stage2MaxF)} or below within a total of {c.totalHours} hours. The{" "}
            {c.totalHours} hours run from when cooling started, so whatever stage 1 did not use is all stage 2 gets
            ({c.totalHours - c.stage1Hours} hours at most).
          </li>
        </ol>
        <p>
          The first stage is the strict one because food passes through the fastest-growth temperatures on the way down.
          Food that misses a stage is usually reheated to {formatTemp(reheat, "F")} (3-403.11) and cooled again, or
          discarded; follow your HACCP plan and your inspector.
        </p>
        <p>
          A Templog cooling timer starts when the food comes off heat, counts both deadlines on the Lock Screen, asks
          for the stage 1 reading by the {c.stage1Hours}-hour mark and the stage 2 reading by the {c.totalHours}-hour
          mark, and records a fail if a reading is too warm or late. Food made from room-temperature ingredients has its
          own rule (3-501.14(B): {formatTemp(c.stage2MaxF, "F")} within 4 hours); Templog v0.1 does not time that case.
        </p>

        <h2>How often to check</h2>
        <p>
          The Food Code says what temperatures to hold, not how often to measure them. A common rule of thumb in health
          department guidance and HACCP plans is <strong>at least every 2 hours</strong>: food found out of range at a
          2-hour check can usually still be corrected, and you have a record showing it was caught. Templog suggests a
          2-hour cadence for holding checkpoints; you can choose any interval, or fixed times, to match your plan.
        </p>

        <h2>Templog&apos;s default limits</h2>
        <p>Every limit is editable per checkpoint. These are the starting points:</p>
      </div>
      <div className="mt-2 max-w-[68ch] overflow-x-auto rounded-lg bg-elevated shadow-sm ring-1 ring-line">
        <table className="w-full text-left text-callout">
          <caption className="sr-only">Default limits by checkpoint type, with Food Code sections</caption>
          <thead className="text-ink-2">
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-3 font-semibold">
                Checkpoint type
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Passes when
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Food Code
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(Object.keys(FOOD_CODE_DEFAULTS) as CheckpointKind[]).map((kind) => (
              <tr key={kind}>
                <th scope="row" className="px-4 py-3 font-semibold">
                  {kindLabel(kind)}
                </th>
                <td className="px-4 py-3 tabular">
                  {limitsLabel({ limits: FOOD_CODE_DEFAULTS[kind] }, "F")} / {limitsLabel({ limits: FOOD_CODE_DEFAULTS[kind] }, "C")}
                </td>
                <td className="px-4 py-3 text-ink-2">{CITATIONS[kind]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prose-doc">
        <h2>Sources</h2>
        <ul>
          <li>
            U.S. Food and Drug Administration, <a href={FDA_FOOD_CODE_URL}>Food Code 2022</a>: 3-202.11 (receiving),
            3-401.11 (cooking), 3-403.11 (reheating for hot holding), 3-501.14 (cooling), 3-501.16 (hot and cold
            holding).
          </li>
          <li>Your state or local health department: the code that actually applies to your kitchen.</li>
        </ul>
        <p>
          Questions about what Templog does with these rules? <Link href="/support">Get in touch</Link>.
        </p>
      </div>
    </article>
  );
}
