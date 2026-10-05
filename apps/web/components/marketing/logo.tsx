/** The thermometer mark: a steel tube with the heat rising in it. Stroke follows the text colour. */
export function ThermoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect x="12" y="3" width="8" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="23.5" r="5.5" className="fill-heat" />
      <rect x="14.75" y="10" width="2.5" height="12" rx="1.25" className="fill-heat" />
      <path d="M23 7h3M23 11h2M23 15h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <ThermoMark />
      <span className="condensed text-headline font-bold tracking-tight">Templog</span>
    </span>
  );
}
