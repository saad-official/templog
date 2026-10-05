import packageJson from "@/package.json";

/** Liveness probe. No secrets, no database. */
export function GET() {
  return Response.json({ ok: true, service: "templog", version: packageJson.version });
}
