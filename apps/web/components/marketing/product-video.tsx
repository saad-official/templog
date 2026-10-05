"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The 28-second product preview (rendered with Remotion from the shared tokens and Food Code
 * limits). Muted autoplay loop, except under prefers-reduced-motion: then the poster shows with a
 * play button. The server render assumes reduced motion, so nothing autoplays before the
 * preference is known.
 */
export function ProductVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED_MOTION).matches, () => true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (reduced) video.pause();
    else video.play().catch(() => {});
  }, [reduced]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <figure>
      <div className="relative overflow-hidden rounded-lg bg-elevated shadow-lg ring-1 ring-line">
        <video
          ref={ref}
          className="block aspect-video w-full"
          src={src}
          poster={poster}
          autoPlay={!reduced}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Templog product preview: the walk-in cooler check comes due, it is logged on the keypad at 41.0 °F and stamped Pass, then a chili cooling timer shows 48 minutes left in stage 1 and counts down in a Lock Screen Live Activity with Log reading and Discarded. Then the Home Screen widget with the next check, the Android Live Update for the cooling timer, and the inspector PDF with a corrective action."
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {playing ? (
          <button
            type="button"
            onClick={toggle}
            className="absolute right-3 bottom-3 grid size-11 place-items-center rounded-full bg-elevated/90 text-ink ring-1 ring-edge"
            aria-label="Pause the product preview"
          >
            <Pause aria-hidden className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggle}
            className="absolute inset-0 m-auto inline-flex h-12 w-fit items-center gap-2 rounded-full bg-heat px-6 text-body font-semibold text-on-heat shadow-md transition-colors duration-150 hover:bg-heat-pressed"
          >
            <Play aria-hidden className="size-5 fill-current" />
            Play preview
          </button>
        )}
      </div>
      <figcaption className="mt-3 text-callout text-ink-2">Product preview: screens recreated from the app&apos;s design system.</figcaption>
    </figure>
  );
}
