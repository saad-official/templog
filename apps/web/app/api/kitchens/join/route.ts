import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { joinKitchen, joinKitchenSchema } from "@/lib/services/kitchens";

/**
 * Joins a kitchen as staff: `{ code: "ABCD-2345", displayName?, initials? }`.
 * 200 `{ kitchen }`; 404 `kitchen_not_found`, 409 `own_kitchen` / `kitchen_full`.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await readJson(request, joinKitchenSchema);
    return Response.json({ kitchen: await joinKitchen(await getDb(), user, input) });
  } catch (error) {
    return errorResponse(error, "kitchens join");
  }
}
