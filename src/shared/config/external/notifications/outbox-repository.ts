import { Prisma, type DiscordEventOutbox } from "@prisma/client";
import prisma from "../../database/prisma";
import type { DiscordEvent } from "./discordevents-publisher";

export interface PendingDiscordEvent {
  id: string;
  event: DiscordEvent;
}

/**
 * Stores only pending envelopes. There are no delivery attempts, statuses,
 * or Discord message IDs here — the notification service owns transient
 * delivery state, and this outbox is drained once per event.
 */
export interface IDiscordOutboxRepository {
  append(event: DiscordEvent): Promise<void>;
  findPending(limit: number): Promise<PendingDiscordEvent[]>;
  markPublished(id: string): Promise<void>;
}

export class PrismaDiscordOutboxRepository implements IDiscordOutboxRepository {
  async append(event: DiscordEvent): Promise<void> {
    await prisma.discordEventOutbox.createMany({
      data: [
        {
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
  }

  async findPending(limit: number): Promise<PendingDiscordEvent[]> {
    const rows: DiscordEventOutbox[] = await prisma.discordEventOutbox.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      event: row.payload as unknown as DiscordEvent,
    }));
  }

  async markPublished(id: string): Promise<void> {
    await prisma.discordEventOutbox.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
  }
}
