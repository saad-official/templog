import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { deleteKitchen } from "@/lib/services/kitchens";

/**
 * Owner only: stop sharing. Deletes the kitchen, its memberships and every
 * checkpoint, reading and cooling item synced for it. 403 for staff (who
 * leave via DELETE /members/:userId), 404 for anyone else.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    await deleteKitchen(await getDb(), user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "kitchens delete");
  }
}
