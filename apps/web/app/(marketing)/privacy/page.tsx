import type { Metadata } from "next";
import { POLICY_UPDATED, SUPPORT_EMAIL } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Templog stores, where, and how to export or delete it. Readings stay on your phone unless you share a kitchen.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 pt-14 sm:px-8">
      <div className="prose-doc">
        <h1 className="text-title font-bold sm:text-[36px] sm:leading-[42px]">Privacy policy</h1>
        <p className="mt-2 text-callout">Last updated {POLICY_UPDATED}</p>

        <h2>The short version</h2>
        <ul>
          <li>Your kitchen, checkpoints, readings and cooling timers are stored on your phone.</li>
          <li>You can use every logging feature without an account. Then nothing you log leaves the phone.</li>
          <li>
            If you share a kitchen with your staff, you sign in with an email address and the kitchen&apos;s records are
            copied to our server so every phone in the kitchen sees the same log.
          </li>
          <li>Readings are kitchen records. They carry initials, not names.</li>
          <li>There are no ads, we do not use tracking or analytics tools, and we never sell data.</li>
          <li>You can export your records, stop sharing, and delete everything at any time.</li>
        </ul>

        <h2>Data on your phone</h2>
        <p>
          The kitchen&apos;s name, time zone, unit and opening hours; your checkpoints (name, type, limits and
          schedule); every reading (temperature, time, pass or fail, the initials of the person who logged it, and any
          corrective action and note); your cooling items; and your settings are kept in a database on the phone.
          Reminders are scheduled locally by the phone and never pass through a server. PDF and CSV exports are made on
          the phone and only go where you send them.
        </p>

        <h2>The optional account and shared kitchen</h2>
        <p>
          An account is only needed to share a kitchen between phones. When you create one we store your{" "}
          <strong>name, email address and a hashed password</strong> (never the password itself), plus the session
          tokens that keep you signed in.
        </p>
        <p>
          When the owner <strong>shares a kitchen</strong>, the server stores the kitchen&apos;s name, time zone, unit,
          opening hours and join code, and each phone in the kitchen copies its checkpoints, readings and cooling items
          to the server so the others can download them. For each person in the kitchen we store the display name and
          initials they chose, their role (owner or staff) and when they joined.
        </p>

        <h2>Push notifications</h2>
        <p>
          If you are signed in and allow notifications, we store your device&apos;s <strong>Expo push token</strong> and
          whether it is an iPhone or Android device, linked to your account. The server uses it for one thing: the
          owner&apos;s weekly summary on Mondays (the share of checks logged, the number of fails, and the checkpoint
          missed most). It is sent through Expo&apos;s push service, which passes it to Apple Push Notification service
          or Firebase Cloud Messaging. Check reminders and cooling alerts are local notifications on your phone.
        </p>

        <h2>Where it is stored and who processes it</h2>
        <ul>
          <li>
            <strong>Vercel</strong> hosts this website and the Templog server. Like any web host it keeps standard
            request logs (such as IP address and time) for a short period, for security and troubleshooting.
          </li>
          <li>
            <strong>Neon</strong> hosts the Postgres database that holds accounts and shared kitchens.
          </li>
          <li>
            <strong>Expo</strong>, <strong>Apple</strong> and <strong>Google</strong> deliver push notifications, as
            described above.
          </li>
        </ul>
        <p>We do not share data with anyone else, we do not use it for advertising, and we do not sell it.</p>

        <h2>Cookies</h2>
        <p>
          This website sets no cookies for visitors. Signing in to the app uses a session cookie on our server, only to
          keep you signed in.
        </p>

        <h2>How long we keep it</h2>
        <p>
          A shared kitchen&apos;s records stay on the server while the kitchen is shared. When staff leave, or the owner
          removes them, their access ends; the readings they logged stay in the kitchen&apos;s records, because they are
          the kitchen&apos;s log. When the owner deletes the shared kitchen, the kitchen, its members and every copied
          checkpoint, reading and cooling item are deleted from the server. Deleting your account deletes your account,
          any kitchen you own with everything copied for it, your memberships and your push tokens. Push tokens that
          Apple or Google report as no longer valid are deleted automatically.
        </p>

        <h2>Export and delete</h2>
        <ul>
          <li>
            <strong>Export:</strong> make a PDF or CSV of any day, week or month from the app and share it however you
            like.
          </li>
          <li>
            <strong>Delete on the phone:</strong> delete the data from the app&apos;s settings, or uninstall the app.
          </li>
          <li>
            <strong>Stop sharing or leave:</strong> the owner can delete the shared kitchen; staff can leave it.
          </li>
          <li>
            <strong>Delete your account:</strong> from the app&apos;s settings. If you cannot reach the app, email us and
            we will delete it for you.
          </li>
        </ul>

        <h2>Children</h2>
        <p>Templog is a tool for food businesses and is not directed at children. Accounts are for adults.</p>

        <h2>Changes and contact</h2>
        <p>
          If this policy changes we will update the date above, and tell you in the app if the change is significant.
          Questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>
    </article>
  );
}
