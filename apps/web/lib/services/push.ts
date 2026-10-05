import "server-only";
import { inArray } from "drizzle-orm";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { Db } from "@/lib/db/client";
import { devices } from "@/lib/db/schema";
import { optionalEnv } from "@/lib/env";

/** Sends a batch of messages; tickets come back in message order. */
export type PushSender = (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;

/** Real sender: Expo Push API, chunked to its 100-message limit. */
export function expoPushSender(): PushSender {
  const accessToken = optionalEnv("EXPO_ACCESS_TOKEN");
  const expo = new Expo(accessToken ? { accessToken } : {});
  return async (messages) => {
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of expo.chunkPushNotifications(messages)) {
      tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
    }
    return tickets;
  };
}

let testSender: PushSender | null = null;

/** The sender routes use: Expo, or the one a test installed. */
export function getPushSender(): PushSender {
  return testSender ?? expoPushSender();
}

/** Tests: route every push through `sender` (null restores Expo). */
export function setPushSenderForTests(sender: PushSender | null): void {
  testSender = sender;
}

/** Deletes tokens whose tickets say DeviceNotRegistered (app uninstalled, token rotated). Returns how many. */
export async function pruneDeadTokens(db: Db, messages: ExpoPushMessage[], tickets: ExpoPushTicket[]): Promise<number> {
  const gone = tickets.flatMap((ticket, index) =>
    ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? [messages[index]!.to as string] : [],
  );
  if (gone.length === 0) return 0;
  const removed = await db.delete(devices).where(inArray(devices.expoPushToken, gone)).returning({ id: devices.id });
  return removed.length;
}

