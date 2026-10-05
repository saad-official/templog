import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/marketing/content";
import { Wordmark } from "./logo";

const LINKS = [
  { href: "/food-code", label: "The Food Code rules" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/support", label: "Support" },
] as const;

export function Disclaimer() {
  return (
    <p className="text-callout text-ink-2">
      <strong className="font-semibold text-ink">
        Templog helps you keep records; it is not a substitute for your local health code or HACCP plan.
      </strong>{" "}
      Default limits follow the FDA Food Code. Your state or county may have adopted a different edition or stricter
      rules, and your inspector has the final word.
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-elevated">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-[1fr_auto]">
        <div className="max-w-xl space-y-4">
          <Wordmark />
          <Disclaimer />
          <p className="text-callout text-ink-2">
            Questions or problems:{" "}
            <a className="break-all text-cold-ink underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="space-y-2 text-callout">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-ink-2 hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-caption text-ink-2 sm:px-8">
        © 2026 Templog. Free, with no subscription and no ads.
      </p>
    </footer>
  );
}
