import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { createKitchen, createKitchenSchema, listKitchens } from "@/lib/services/kitchens";

/**
 * POST: share a kitchen. Body `{ id?, name, tz, unit?, openingHours, displayName?, initials? }`
 * (`id` = the device's local kitchen UUID). 201 `{ kitchen }` with the invite
 * code to share, or 200 with the kitchen the caller already owns.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await readJson(request, createKitchenSchema);
    const { kitchen, created } = await createKitchen(await getDb(), user, input);
    return Response.json({ kitchen }, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error, "kitchens create");
  }
}

/** GET: `{ kitchens }`, every kitchen the caller owns or works in, with members. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ kitchens: await listKitchens(await getDb(), user.id) });
  } catch (error) {
    return errorResponse(error, "kitchens list");
  }
}
