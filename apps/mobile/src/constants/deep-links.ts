import type { Href } from 'expo-router';

const ROUTED = /^\/(today|history|log\/[^/?]+|cooling(\/[^/?]+)?)(\?.*)?$/;

/**
 * `templog://log/abc?scheduledFor=…` → `/log/abc?scheduledFor=…`, `templog://cooling/x` →
 * `/cooling/x`, `templog://today` → `/today`, `templog://history` → `/history` (notification taps,
 * widgets and Live Activity links forwarded by the native services). Anything else opens Today.
 */
export function hrefFromUrl(url: string): Href {
  const path = url.replace(/^templog:\/\/\/?/, '/').replace(/^\/\/+/, '/');
  return (ROUTED.test(path) ? path : '/today') as Href;
}
