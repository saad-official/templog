import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_UPDATED, SUPPORT_EMAIL } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using the Templog app and website.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 pt-14 sm:px-8">
      <div className="prose-doc">
        <h1 className="text-title font-bold sm:text-[36px] sm:leading-[42px]">Terms of use</h1>
        <p className="mt-2 text-callout">Last updated {POLICY_UPDATED}</p>

        <h2>Using Templog</h2>
        <p>
          Templog is a free app for keeping food-safety temperature records: scheduled holding checks, cooling timers
          and exports. By using the app or this website you agree to these terms. There is no charge, no subscription
          and no in-app purchase.
        </p>

        <h2>Templog keeps records; you keep food safe</h2>
        <ul>
          <li>
            Templog helps you keep records; it is not a substitute for your local health code or HACCP plan. Its default
            limits follow the FDA Food Code, but the rules that apply to your business are set by your jurisdiction, and
            you are responsible for following them.
          </li>
          <li>
            A reading is only as good as the thermometer and the person taking it. Calibrate your thermometers and log
            what you actually measured.
          </li>
          <li>
            Reminders and timers depend on the phone: notification permissions, battery settings, Focus modes and the
            phone being on. Templog cannot guarantee that every reminder arrives. Do not rely on it as the only safeguard
            for food safety.
          </li>
          <li>We do not promise that any inspector or health department will accept Templog records.</li>
        </ul>

        <h2>Your account and shared kitchens</h2>
        <ul>
          <li>Keep your password to yourself, and tell us if you think someone else has used your account.</li>
          <li>
            Share your kitchen&apos;s join code only with people who work there. Only join a kitchen if its owner gave
            you the code.
          </li>
          <li>Do not use Templog to send spam, to harass anyone, or to try to get into other people&apos;s data.</li>
          <li>Do not enter false records. Templog is built to show missed checks as missed.</li>
        </ul>
        <p>We may suspend accounts that break these rules.</p>

        <h2>Your data</h2>
        <p>
          Your records are yours. How they are stored and how to export or delete them is set out in the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>

        <h2>Changes to the service</h2>
        <p>
          We may change or improve Templog, and we may update these terms; the date above shows the latest version. If
          we ever stop running the shared-kitchen server, logging on your phone keeps working and you can still export
          your records.
        </p>

        <h2>No warranty</h2>
        <p>
          Templog is provided as it is, without warranties of any kind. To the extent the law allows, we are not liable
          for any loss arising from a reminder that was late or missing, a record that was lost or wrong, or a decision
          made using the app. Nothing in these terms limits rights you have under consumer law that cannot be limited.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </article>
  );
}
