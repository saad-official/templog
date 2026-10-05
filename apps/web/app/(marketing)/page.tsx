import { Bell, ChevronDown, FileText, LayoutGrid, Timer, Users, WifiOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { COOLING_LIMITS } from "@templog/shared/cooling";
import { FOOD_CODE_DEFAULTS } from "@templog/shared/limits";
import { formatTemp } from "@templog/shared/units";
import {
  LiveActivityStrip,
  NotificationMock,
  PdfMock,
  PhoneFrame,
  TodayScreen,
  WidgetMock,
} from "@/components/marketing/device-mocks";
import { FAQ, INCUMBENTS, STEPS } from "@/lib/marketing/content";
import { findProductVideo } from "@/lib/marketing/product-video";

const temp = (valueF: number) => formatTemp(valueF, "F");
const COLD_MAX = FOOD_CODE_DEFAULTS["cold-holding"].max!;
const HOT_MIN = FOOD_CODE_DEFAULTS["hot-holding"].min!;

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto max-w-6xl scroll-mt-8 px-4 pt-24 sm:px-8">
      <h2 id={`${id}-title`} className="max-w-2xl text-title font-bold sm:text-[36px] sm:leading-[42px]">
        {title}
      </h2>
      {intro ? <div className="mt-4 max-w-2xl text-body text-ink-2">{intro}</div> : null}
      <div className="mt-10">{children}</div>
    </section>
  );
}

function HeroMedia() {
  const video = findProductVideo();
  if (video) {
    return (
      <video
        className="mx-auto w-[300px] max-w-full rounded-[42px] shadow-lg ring-1 ring-edge"
        src={video.src}
        poster={video.poster}
        controls
        muted
        playsInline
        preload="metadata"
      >
        Templog logging a reading and running a cooling timer.
      </video>
    );
  }
  return (
    <figure className="relative mx-auto flex flex-col items-center gap-6 lg:block lg:h-[640px] lg:w-full">
      <figcaption className="sr-only">
        The Templog Today screen for Rosa&apos;s Tacos: 9 of 11 checks logged, the walk-in cooler check due now,
        four checkpoints with pass and fail results, and a chili cooling timer in stage 1 with 48 minutes left. Beside
        it, the Lock Screen Live Activity for the same chili: stage 1, 48 minutes left, with Log reading and Discarded
        buttons.
      </figcaption>
      <div aria-hidden className="lg:absolute lg:top-0 lg:right-10">
        <PhoneFrame>
          <TodayScreen />
        </PhoneFrame>
      </div>
      <div aria-hidden className="w-full max-w-[360px] lg:absolute lg:bottom-6 lg:left-0">
        <LiveActivityStrip />
      </div>
    </figure>
  );
}

function Hero() {
  return (
    <section className="steel relative overflow-hidden border-b border-line" aria-labelledby="hero-title">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{
          background:
            "radial-gradient(45% 60% at 82% 35%, color-mix(in oklab, var(--tl-color-heat) 16%, transparent), transparent 70%), radial-gradient(35% 45% at 60% 80%, color-mix(in oklab, var(--tl-color-cold) 12%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <p className="text-callout font-semibold tracking-wide text-heat-ink uppercase">For independent kitchens and food trucks</p>
          <h1
            id="hero-title"
            className="condensed mt-3 max-w-[14ch] text-[46px] leading-[48px] font-bold tracking-[-0.02em] sm:text-[64px] sm:leading-[64px]"
          >
            Temperature logs the inspector trusts. Free.
          </h1>
          <p className="mt-6 max-w-xl text-[19px] leading-[29px] text-ink-2">
            Templog reminds the line when a holding check is due, logs the reading in two taps, times your cool-downs
            against the Food Code on the Lock Screen, and turns it all into a PDF you can hand over. No paper sheet to
            lose, nothing filled in from memory at closing.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="#how"
              className="inline-flex h-12 items-center rounded-full bg-heat px-6 text-body font-semibold text-on-heat transition-colors duration-150 hover:bg-heat-pressed"
            >
              See how it works
            </Link>
            <Link
              href="/food-code"
              className="inline-flex h-12 items-center rounded-full px-5 text-body font-semibold text-ink ring-1 ring-edge transition-colors duration-150 hover:bg-elevated"
            >
              The rules it follows
            </Link>
          </div>
          <p className="mt-6 text-callout text-ink-2">
            Coming to iPhone and Android. No subscription, no ads, no account needed for one kitchen on one phone.
          </p>
        </div>
        <HeroMedia />
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <Section
      id="how"
      title="Set it up once. Then it runs your checks."
      intro="Most kitchens are set up in ten minutes: name your checkpoints, say when you are open, and hand the phone to whoever is on the line."
    >
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-lg bg-elevated p-5 shadow-sm ring-1 ring-line">
            <span className="condensed block text-[40px] leading-10 font-bold text-heat tabular" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-headline font-semibold">{step.title}</h3>
            <p className="mt-2 text-callout text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-sunken text-ink" aria-hidden>
        {icon}
      </span>
      <div>
        <h3 className="text-headline font-semibold">{title}</h3>
        <p className="mt-1 text-callout text-ink-2">{children}</p>
      </div>
    </div>
  );
}

function NativeFeatures() {
  return (
    <Section
      id="features"
      title="Built for a phone propped on the pass."
      intro="Templog is a native app, not a web form. It does its job from the Lock Screen and the home screen, with or without signal."
    >
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-8 sm:grid-cols-2">
          <Feature icon={<Bell className="size-5" />} title="Reminders that reach the line">
            Each due check is a notification with Log now and Snooze 15. Overdue checks get a badge, and reminders stay
            quiet outside opening hours.
          </Feature>
          <Feature icon={<Timer className="size-5" />} title="Cooling timers on the Lock Screen">
            Start a timer when food comes off heat. A Live Activity on iPhone (and a Live Update on Android 16) counts
            down stage 1 and stage 2 and asks for each reading, with Log reading and Discarded right there.
          </Feature>
          <Feature icon={<LayoutGrid className="size-5" />} title="Widgets">
            The next check and today&apos;s compliance on the home screen, and a Lock Screen circle with the minutes to
            the next check.
          </Feature>
          <Feature icon={<WifiOff className="size-5" />} title="Offline first">
            Readings are saved on the phone the moment you log them. A basement walk-in or a truck at a festival is
            fine.
          </Feature>
        </div>
        <div aria-hidden className="flex flex-col items-center gap-4 lg:w-[360px]">
          <NotificationMock />
          <WidgetMock />
        </div>
      </div>
    </Section>
  );
}

function Cooling() {
  return (
    <Section
      id="cooling"
      title="Two-stage cooling, counted for you."
      intro={
        <p>
          The Food Code gives cooked food {COOLING_LIMITS.stage1Hours} hours to get from {temp(COOLING_LIMITS.startF)}{" "}
          to {temp(COOLING_LIMITS.stage1MaxF)}, and {COOLING_LIMITS.totalHours} hours in total to reach{" "}
          {temp(COOLING_LIMITS.stage2MaxF)}. That is the step paper logs handle worst, because nobody is watching the
          clock at 2 AM. Templog starts the clock, prompts for each reading, and records a fail with a corrective action
          if a stage is missed. Several items can cool at once.{" "}
          <Link href="/food-code" className="text-cold-ink underline">
            The rules in plain language
          </Link>
          .
        </p>
      }
    >
      <ol className="grid gap-4 sm:grid-cols-3">
        {[
          { at: "0:00", title: "Off heat", body: `Start the timer. Stage 1 is open: ${temp(COOLING_LIMITS.stage1MaxF)} or below within ${COOLING_LIMITS.stage1Hours} hours.` },
          { at: `${COOLING_LIMITS.stage1Hours}:00`, title: "Stage 1 reading", body: `Log the temperature. At or below ${temp(COOLING_LIMITS.stage1MaxF)}, stage 2 opens. Above it, or late, it is a fail: reheat or discard.` },
          { at: `${COOLING_LIMITS.totalHours}:00`, title: "Stage 2 reading", body: `${temp(COOLING_LIMITS.stage2MaxF)} or below by the ${COOLING_LIMITS.totalHours}-hour mark, counted from when cooling started. Then it is done.` },
        ].map((stage) => (
          <li key={stage.title} className="rounded-lg bg-elevated p-5 shadow-sm ring-1 ring-line">
            <span className="condensed text-[32px] leading-9 font-bold text-heat-ink tabular">{stage.at}</span>
            <h3 className="mt-2 text-headline font-semibold">{stage.title}</h3>
            <p className="mt-1 text-callout text-ink-2">{stage.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function WhyFree() {
  return (
    <Section
      id="free"
      title="Why it is free."
      intro={
        <p>
          Keeping a temperature log is the law, not a premium feature. The digital tools that do it well are priced for
          chains with an operations budget, so most small kitchens are still on a clipboard.
        </p>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg bg-elevated p-6 shadow-sm ring-1 ring-line">
          <h3 className="text-headline font-semibold">What the alternatives cost</h3>
          <ul className="mt-4 divide-y divide-line">
            {INCUMBENTS.map((item) => (
              <li key={item.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="text-body">{item.name}</span>
                <span className="text-callout font-semibold text-ink-2 tabular">{item.price}</span>
              </li>
            ))}
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <span className="text-body font-semibold">Templog</span>
              <span className="text-callout font-semibold text-pass-ink">Free</span>
            </li>
          </ul>
          <p className="mt-3 text-caption text-ink-2">
            Published starting prices as of October 2026; check each vendor for current pricing. They do more than
            temperature logs, and some include hardware.
          </p>
        </div>
        <div className="space-y-4 text-body text-ink-2">
          <p>
            Templog does one job: the temperature log. The phone does the work, so there are no servers to pay for
            unless you share a kitchen, and that runs on free hosting tiers.
          </p>
          <p>
            No ads, no selling data, no &quot;free for 14 days&quot;. If you never create an account, nothing you log
            leaves your phone.
          </p>
        </div>
      </div>
    </Section>
  );
}

function Pdf() {
  return (
    <Section
      id="pdf"
      title="A PDF that answers the inspector's questions."
      intro="Per day, week or month: every checkpoint, every reading with time and initials, every fail with what was done about it. Missed checks are listed as missed, never quietly filled in. Export as PDF or CSV from the share sheet."
    >
      <div aria-hidden className="flex justify-center lg:justify-start">
        <PdfMock />
      </div>
    </Section>
  );
}

function Team() {
  return (
    <Section
      id="team"
      title="One kitchen, every phone."
      intro="Run it on one phone with no account at all. When more than one person logs, the owner signs in, creates the kitchen and shares an 8-character join code."
    >
      <div className="grid gap-8 sm:grid-cols-3">
        <Feature icon={<Users className="size-5" />} title="Join with a code">
          Staff type the code once. Checkpoints, readings and cooling timers sync between phones, and the owner sees who
          logged what by their initials.
        </Feature>
        <Feature icon={<FileText className="size-5" />} title="A Monday summary">
          Each Monday the owner gets one notification: last week&apos;s share of checks logged, the fails, and the
          checkpoint missed most.
        </Feature>
        <Feature icon={<WifiOff className="size-5" />} title="Still offline first">
          Every phone keeps working without signal and catches up later. The newest change wins.
        </Feature>
      </div>
    </Section>
  );
}

function Faq() {
  return (
    <Section id="faq" title="Questions owners ask.">
      <div className="faq max-w-3xl divide-y divide-line rounded-lg bg-elevated shadow-sm ring-1 ring-line">
        {FAQ.map((item) => (
          <details key={item.q} className="group px-5">
            <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-body font-semibold">
              {item.q}
              <ChevronDown aria-hidden className="chevron size-5 shrink-0 text-ink-2" />
            </summary>
            <p className="pb-5 text-callout text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 max-w-3xl text-callout text-ink-2">
        Default limits: cold holding {temp(COLD_MAX)} or below, hot holding {temp(HOT_MIN)} or above. Every limit is
        editable per checkpoint.
      </p>
    </Section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <NativeFeatures />
      <Cooling />
      <WhyFree />
      <Pdf />
      <Team />
      <Faq />
    </>
  );
}
