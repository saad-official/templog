import type { CSSProperties, ReactNode } from "react";
import { COOLING_LIMITS } from "@templog/shared/cooling";
import { evaluateReading, FOOD_CODE_DEFAULTS, limitsLabel } from "@templog/shared/limits";
import type { CheckpointKind } from "@templog/shared/schemas";
import { formatTemp } from "@templog/shared/units";
import { ThermoMark } from "./logo";

/**
 * Product illustrations built from tokens (no screenshots). Limits and
 * pass/fail come from the shared Food Code defaults, so the mock can never
 * show a reading the app would judge differently. Every mock is aria-hidden;
 * the <figure> around it carries a text description instead.
 */

type MockCheckpoint = { name: string; kind: CheckpointKind; valueF: number; at: string; initials: string; action?: string };

export const MOCK_CHECKPOINTS: MockCheckpoint[] = [
  { name: "Walk-in cooler", kind: "cold-holding", valueF: 37.8, at: "12:04", initials: "SR" },
  { name: "Prep reach-in", kind: "cold-holding", valueF: 40.1, at: "12:06", initials: "SR" },
  { name: "Hot well", kind: "hot-holding", valueF: 128, at: "11:58", initials: "MA", action: "Reheated to 168 °F" },
  { name: "Soup kettle", kind: "hot-holding", valueF: 152, at: "12:01", initials: "MA" },
];

const temp = (valueF: number) => formatTemp(valueF, "F");
export const STAGE1_LABEL = `≤ ${temp(COOLING_LIMITS.stage1MaxF)}`;

function Chip({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="rounded-full bg-pass-soft px-2 py-0.5 text-[11px] font-semibold text-pass-ink">Pass</span>
  ) : (
    <span className="rounded-full bg-heat px-2 py-0.5 text-[11px] font-semibold text-on-heat">Fail</span>
  );
}

function CheckpointRow({ row }: { row: MockCheckpoint }) {
  const limits = FOOD_CODE_DEFAULTS[row.kind];
  const { result } = evaluateReading({ limits }, row.valueF);
  const cold = row.kind === "cold-holding" || row.kind === "freezer";
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className={`h-8 w-1 shrink-0 rounded-full ${cold ? "bg-cold" : "bg-heat"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-5 font-semibold text-ink">{row.name}</span>
        <span className="block truncate text-[11px] leading-4 text-ink-2">
          {row.action ?? `${limitsLabel({ limits }, "F")} · ${row.at} · ${row.initials}`}
        </span>
      </span>
      <span className="condensed text-[17px] font-semibold text-ink tabular">{temp(row.valueF)}</span>
      <Chip pass={result === "pass"} />
    </li>
  );
}

/** A phone bezel. The bezel layer is forced dark; the screen follows the page scheme. */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative w-[300px] max-w-full p-[10px] ${className}`}>
      <div data-scheme="dark" className="absolute inset-0 rounded-[52px] bg-sunken shadow-lg ring-1 ring-edge" />
      <div className="relative h-[600px] overflow-hidden rounded-[42px] bg-surface">
        <div data-scheme="dark" className="absolute top-2.5 left-1/2 z-10 h-7 w-24 -translate-x-1/2 rounded-full bg-sunken" />
        {children}
      </div>
    </div>
  );
}

/** A cooling item mid stage 1. `used` is the share of the stage elapsed. */
export function CoolingCard({ used = 60 }: { used?: number }) {
  return (
    <div className="rounded-md bg-elevated p-3 shadow-sm ring-1 ring-line">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wide text-heat-ink uppercase">Cooling · Stage 1</span>
        <span className="text-[11px] text-ink-2">
          {STAGE1_LABEL} in {COOLING_LIMITS.stage1Hours} h
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-ink">Chili, 4 gal</span>
        <span className="condensed text-[22px] leading-7 font-semibold text-ink tabular">48 min</span>
      </div>
      <div className="stage-bar mt-2 h-1.5 rounded-full" style={{ "--used": `${used}%` } as CSSProperties} />
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-2">
        <span>Off heat 12:20 · RD</span>
        <span className="font-semibold text-heat-ink">Next reading by 2:20</span>
      </div>
    </div>
  );
}

/** The Today screen: due-now card, checkpoints with pass/fail chips, a cooling timer. */
export function TodayScreen() {
  return (
    <div className="flex h-full flex-col px-4 pt-12 pb-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium text-ink-2">Mon 5 Oct · Rosa&apos;s Tacos</p>
          <p className="text-[24px] leading-8 font-bold tracking-tight text-ink">Today</p>
        </div>
        <p className="text-right text-[11px] leading-4 text-ink-2">
          <span className="condensed block text-[20px] leading-6 font-semibold text-ink tabular">9/11</span>
          checks logged
        </p>
      </div>

      <div className="mt-3 shrink-0 rounded-md bg-cold-soft p-3 ring-1 ring-cold/30">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wide text-cold-ink uppercase">Due now</span>
          <span className="text-[11px] text-cold-ink tabular">2:00 PM</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[15px] font-semibold text-ink">Walk-in cooler</span>
          <span className="rounded-full bg-cold px-3 py-1 text-[12px] font-semibold text-on-cold">Log reading</span>
        </div>
      </div>

      <ul className="mt-3 shrink-0 divide-y divide-line overflow-hidden rounded-md bg-elevated shadow-sm ring-1 ring-line">
        {MOCK_CHECKPOINTS.map((row) => (
          <CheckpointRow key={row.name} row={row} />
        ))}
      </ul>

      <div className="mt-3 shrink-0">
        <CoolingCard />
      </div>

      <nav className="mt-auto flex justify-between border-t border-line px-2 pt-2 text-[10px] font-medium text-ink-3">
        {["Today", "Log", "Cooling", "History", "Settings"].map((tab) => (
          <span key={tab} className={tab === "Today" ? "text-heat-ink" : undefined}>
            {tab}
          </span>
        ))}
      </nav>
    </div>
  );
}

/** The Lock Screen Live Activity for a cooling item. Always dark, like the Lock Screen. */
export function LiveActivityStrip() {
  return (
    <div data-scheme="dark" className="w-full max-w-[360px] rounded-[26px] bg-elevated/95 p-4 text-ink shadow-lg ring-1 ring-edge">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-heat-soft text-heat-ink">
          <ThermoMark className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-5 font-semibold">Chili · Stage 1</p>
          <p className="text-[12px] leading-4 text-ink-2">
            {STAGE1_LABEL} by 2:20 PM
          </p>
        </div>
        <p className="condensed text-[26px] leading-7 font-semibold tabular">
          48<span className="text-[13px] font-medium text-ink-2"> min left</span>
        </p>
      </div>
      <div className="stage-bar mt-3 h-1.5 rounded-full" style={{ "--used": "60%" } as CSSProperties} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <span className="rounded-full bg-heat py-2 text-center text-[13px] font-semibold text-on-heat">Log reading</span>
        <span className="rounded-full bg-sunken py-2 text-center text-[13px] font-semibold text-ink">Discarded</span>
      </div>
    </div>
  );
}

/** Home-screen widget: next check and today's compliance. */
export function WidgetMock() {
  return (
    <div className="grid size-[150px] grid-rows-[auto_1fr_auto] rounded-[24px] bg-elevated p-3.5 shadow-md ring-1 ring-line">
      <span className="text-[11px] font-semibold text-ink-2">Next check</span>
      <span className="self-center">
        <span className="condensed block text-[30px] leading-8 font-semibold text-ink tabular">14 min</span>
        <span className="block truncate text-[12px] text-ink-2">Hot well</span>
      </span>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-pass-ink">
        <span className="size-2 rounded-full bg-pass" /> 92% today
      </span>
    </div>
  );
}

/** Notification for a due check, with its actions. */
export function NotificationMock() {
  return (
    <div data-scheme="dark" className="w-full max-w-[360px] rounded-[22px] bg-elevated/95 p-3.5 text-ink shadow-lg ring-1 ring-edge">
      <div className="flex items-center gap-2 text-[12px] text-ink-2">
        <ThermoMark className="size-4" /> TEMPLOG <span className="ml-auto">now</span>
      </div>
      <p className="mt-1 text-[14px] font-semibold">Walk-in cooler check is due</p>
      <p className="text-[13px] text-ink-2">2:00 PM · {limitsLabel({ limits: FOOD_CODE_DEFAULTS["cold-holding"] }, "F")}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[13px] font-semibold">
        <span className="rounded-lg bg-sunken py-1.5 text-center">Log now</span>
        <span className="rounded-lg bg-sunken py-1.5 text-center">Snooze 15</span>
      </div>
    </div>
  );
}

/** A slice of the inspector PDF. Paper is always light. */
export function PdfMock() {
  const rows = MOCK_CHECKPOINTS.map((row) => ({
    ...row,
    result: evaluateReading({ limits: FOOD_CODE_DEFAULTS[row.kind] }, row.valueF).result,
  }));
  return (
    <div data-scheme="light" className="w-full max-w-[460px] rounded-sm bg-elevated p-5 text-ink shadow-lg ring-1 ring-line">
      <div className="flex items-start justify-between border-b border-ink pb-2">
        <div>
          <p className="text-[15px] font-bold">Temperature log · Rosa&apos;s Tacos</p>
          <p className="text-[11px] text-ink-2">Monday 5 October 2026 · America/Chicago · °F</p>
        </div>
        <ThermoMark className="size-6" />
      </div>
      <table className="mt-2 w-full text-left text-[11px] tabular">
        <thead className="text-ink-2">
          <tr>
            <th className="py-1 font-semibold">Time</th>
            <th className="py-1 font-semibold">Checkpoint</th>
            <th className="py-1 font-semibold">Reading</th>
            <th className="py-1 font-semibold">Result</th>
            <th className="py-1 font-semibold">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="py-1">{row.at}</td>
              <td className="py-1">{row.name}</td>
              <td className="py-1">{temp(row.valueF)}</td>
              <td className={`py-1 font-semibold ${row.result === "pass" ? "text-pass-ink" : "text-heat-ink"}`}>
                {row.result === "pass" ? "Pass" : "Fail"}
              </td>
              <td className="py-1">{row.initials}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1">10:00</td>
            <td className="py-1">Prep reach-in</td>
            <td className="py-1 text-ink-2" colSpan={2}>
              Missed: no reading
            </td>
            <td className="py-1">–</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 rounded-sm bg-heat-soft px-2 py-1.5 text-[11px] text-heat-ink">
        Corrective action 11:58 · Hot well: reheated to 168 °F, rechecked 12:20 (MA)
      </p>
    </div>
  );
}
