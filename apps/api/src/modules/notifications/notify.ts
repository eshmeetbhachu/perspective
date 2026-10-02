import type { Executor } from "../../db/client";
import { notifications } from "../../db/schema";

type NotificationValues = typeof notifications.$inferInsert;

// Written in the caller's transaction, so a notification exists exactly when
// the challenge or reply it points at was saved. Nobody is notified about
// their own actions.
export async function notify(
  tx: Executor,
  values: Omit<NotificationValues, "userId"> & { userId: string | null },
): Promise<void> {
  const { userId, ...rest } = values;
  if (!userId || userId === values.actorId) return;
  await tx.insert(notifications).values({ ...rest, userId });
}
