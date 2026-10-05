import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { SyncPushRequestSchema } from "@/lib/sync/contract";
import { pushChanges } from "@/lib/services/sync";

/**
 * Upserts the device's changed kitchen settings, checkpoints, readings and
 * cooling items (merge rules in lib/sync/contract.ts). Session required, and
 * the caller must be a member of every kitchen in the push (403
 * `not_a_member` otherwise). Answer: `{ serverTime, accepted }`.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await readJson(request, SyncPushRequestSchema);
    return Response.json(await pushChanges(await getDb(), user.id, body));
  } catch (error) {
    return errorResponse(error, "sync push");
  }
}
