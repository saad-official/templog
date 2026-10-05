import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { colors } from "@templog/shared/tokens";
import { ThemeProvider } from "@/components/theme-provider";
import { publicEnv } from "@/lib/env";
import { buildTokensCss } from "@/lib/tokens-css";
import "./globals.css";

/** Archivo: an industrial grotesque with a width axis, so readings can run condensed and tabular. */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
});

const TOKENS_CSS = buildTokensCss();

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: {
    default: "Templog: free food-safety temperature logs for small kitchens",
    template: "%s | Templog",
  },
  description:
    "Holding checks on a schedule, reminders that reach the line, two-stage cooling timers on the Lock Screen, and a PDF your inspector can read. Free, offline-first, for independent kitchens and food trucks.",
  applicationName: "Templog",
  openGraph: {
    type: "website",
    siteName: "Templog",
    title: "Templog: temperature logs the inspector trusts. Free.",
    description: "Scheduled holding checks, FDA cooling timers on the Lock Screen and an inspector-ready PDF, for small kitchens.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colors.light.surface },
    { media: "(prefers-color-scheme: dark)", color: colors.dark.surface },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        <style id="templog-tokens" dangerouslySetInnerHTML={{ __html: TOKENS_CSS }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
