import { IdSchema } from "@templog/shared/schemas";
import { ApiError, errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { IsoTimestamp } from "@/lib/sync/contract";
import { pullChanges } from "@/lib/services/sync";

/**
 * Rows of the caller's kitchens changed on the server after `?since=` (the
 * previous pull's `serverTime`; omit for everything), tombstones included.
 * `?kitchenId=` narrows to one kitchen (404 if the caller is not in it).
 * Answer: `{ serverTime, tables: { kitchens, checkpoints, readings, coolingItems } }`.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const search = new URL(request.url).searchParams;
    const since = search.get("since");
    const kitchenId = search.get("kitchenId");
    if (since !== null && !IsoTimestamp.safeParse(since).success) {
      throw new ApiError(400, "`since` must be an ISO 8601 timestamp.", "invalid_since");
    }
    if (kitchenId !== null && !IdSchema.safeParse(kitchenId).success) {
      throw new ApiError(400, "`kitchenId` must be a UUID.", "invalid_kitchen_id");
    }
    const result = await pullChanges(await getDb(), user.id, {
      since: since ? new Date(since) : undefined,
      kitchenId: kitchenId ?? undefined,
    });
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "sync pull");
  }
}
