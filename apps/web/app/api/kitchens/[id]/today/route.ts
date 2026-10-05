import { ApiError, errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { kitchenToday, todayQuerySchema } from "@/lib/services/today";

/**
 * The kitchen at a glance for the owner and staff: `?date=YYYY-MM-DD`
 * (optional; today on kitchen time by default). Answer: `{ kitchenId, name,
 * tz, unit, date, generatedAt, counts: { upcoming, due, overdue, missed,
 * logged, failsToday }, checkpoints: [{ id, name, kind, limits, latestReading,
 * next, checks }], openCooling: [{ id, name, stage, dueAt, minutesLeft, ... }] }`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const parsed = todayQuerySchema.safeParse({ date: search.get("date") ?? undefined });
    if (!parsed.success) {
      throw new ApiError(400, "Query does not match the expected shape.", "invalid_query", parsed.error.issues);
    }
    const view = await kitchenToday(await getDb(), user.id, id, { date: parsed.data.date });
    return Response.json(view, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "kitchen today");
  }
}
