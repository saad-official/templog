import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer } from "@/components/marketing/site-footer";
import { SUPPORT_EMAIL } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Support",
  description: "Help with Templog reminders, cooling timers on the Lock Screen, shared kitchens and your records.",
};

export default function SupportPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 pt-14 sm:px-8">
      <div className="prose-doc">
        <h1 className="text-title font-bold sm:text-[36px] sm:leading-[42px]">Support</h1>
        <p className="mt-4 text-body">
          Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with what you expected and what happened, and
          which phone you use. We read every message.
        </p>

        <h2>Check reminders are not arriving</h2>
        <h3>iPhone</h3>
        <ul>
          <li>Settings, Notifications, Templog: allow notifications, and turn on Time Sensitive Notifications.</li>
          <li>If the phone on the line uses a Focus, add Templog to the apps allowed to notify.</li>
          <li>Open Templog now and then: it schedules the coming checks ahead and tops them up when it opens.</li>
        </ul>
        <h3>Android</h3>
        <ul>
          <li>Settings, Apps, Templog, Notifications: allow notifications and keep the check reminders category on.</li>
          <li>Allow Alarms and reminders for Templog, so checks fire at the exact time.</li>
          <li>Set battery use for Templog to Unrestricted. Some phones stop apps in the background otherwise.</li>
        </ul>
        <p>Reminders stay quiet outside the opening hours you set. Check them in the kitchen settings.</p>

        <h2>The cooling timer is not on the Lock Screen</h2>
        <ul>
          <li>iPhone: Settings, Templog, Live Activities must be on.</li>
          <li>
            Android: Live Updates need Android 16. On earlier versions the timer still runs and you still get a
            notification when each reading is due.
          </li>
          <li>The timer keeps counting even if the Live Activity is dismissed; open the Cooling tab to see it.</li>
        </ul>

        <h2>A reading failed. What now?</h2>
        <p>
          Templog asks for a corrective action before it saves a fail: discard, reheat, move the product, call for
          service, or describe something else. Follow your HACCP plan. Take a new reading after you act and log it too;
          both stay in the record. See <Link href="/food-code">the Food Code rules</Link> for the limits behind each
          check.
        </p>

        <h2>Sharing a kitchen</h2>
        <ul>
          <li>The owner signs in, shares the kitchen and gets an 8-character join code.</li>
          <li>Staff sign in on their own phone and enter the code. Dashes and lower case are fine.</li>
          <li>Phones sync when they have a connection. If two people edit the same thing, the newest change wins.</li>
          <li>The owner can remove anyone; staff can leave. Readings they logged stay in the kitchen&apos;s record.</li>
        </ul>

        <h2>Daylight saving time and time zones</h2>
        <p>
          Checks follow the kitchen&apos;s local clock, so a 2:00 PM check stays at 2:00 PM after the clocks change.
          Cooling deadlines count real elapsed time, so a timer that runs across a clock change is still exactly 2 and 6
          hours.
        </p>

        <h2>Exporting or deleting your records</h2>
        <ul>
          <li>Export a PDF or CSV for any day, week or month from the app.</li>
          <li>
            Delete data on the phone, stop sharing, or delete your account from the app&apos;s settings. Details are in
            the <Link href="/privacy">privacy policy</Link>.
          </li>
        </ul>

        <h2>About the rules</h2>
        <Disclaimer />
      </div>
    </article>
  );
}
