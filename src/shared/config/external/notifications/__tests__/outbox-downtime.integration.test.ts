import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../../../../logging/logger.interface";
import type { DiscordEvent } from "../discordevents-publisher";
import { OutboxDiscordEventsPublisher } from "../outbox-publisher";
import { DiscordOutboxRelay } from "../outbox-relay";
import type {
  IDiscordOutboxRepository,
  PendingDiscordEvent,
} from "../outbox-repository";

function makeEvent(eventId: string): DiscordEvent {
  return {
    eventId,
    eventType: "payment.completed",
    eventVersion: 1,
    occurredAt: "2026-11-17T10:00:00.000Z",
    tenantId: "tenant-1",
    source: "kooi-backend",
    data: { rechargeId: eventId, amountPaisa: 49900 },
  };
}

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function makeInMemoryOutbox() {
  const pending: PendingDiscordEvent[] = [];
  let sequence = 0;

  const outbox: IDiscordOutboxRepository = {
    async append(event) {
      if (pending.some((item) => item.event.eventId === event.eventId)) return;
      pending.push({ id: `row-${++sequence}`, event });
    },
    async findPending(limit) {
      return pending.slice(0, limit);
    },
    async markPublished(id) {
      const index = pending.findIndex((item) => item.id === id);
      if (index >= 0) pending.splice(index, 1);
    },
  };

  return { outbox, pending };
}

function makeRelay(
  outbox: IDiscordOutboxRepository,
  publishOrThrow: (event: DiscordEvent) => Promise<void>,
) {
  return new DiscordOutboxRelay({
    outbox,
    sender: { publishOrThrow },
    logger: makeLogger(),
    enabled: true,
    pollMs: 60_000,
    batchSize: 10,
  });
}

describe("Discord outbox downtime recovery", () => {
  it("retains pending events during a service outage and drains after recovery", async () => {
    const { outbox, pending } = makeInMemoryOutbox();
    const event = makeEvent("payment.completed:rec_1:success");
    const sender = vi
      .fn()
      .mockRejectedValueOnce(new Error("notification service returned 429"))
      .mockResolvedValue(undefined);
    const relay = makeRelay(outbox, sender);

    await new OutboxDiscordEventsPublisher(outbox, makeLogger(), true).publish(
      event,
    );
    expect(pending).toHaveLength(1);

    await relay.tick();
    expect(pending).toHaveLength(1);
    expect(sender).toHaveBeenCalledTimes(1);

    await relay.tick();
    expect(pending).toHaveLength(0);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenLastCalledWith(event);
  });

  it("continues with later pending events after one delivery fails", async () => {
    const { outbox, pending } = makeInMemoryOutbox();
    const first = makeEvent("payment.completed:rec_1:success");
    const second = makeEvent("payment.completed:rec_2:success");
    const publisher = new OutboxDiscordEventsPublisher(
      outbox,
      makeLogger(),
      true,
    );
    await publisher.publish(first);
    await publisher.publish(second);

    const sender = vi
      .fn()
      .mockRejectedValueOnce(new Error("service down"))
      .mockResolvedValue(undefined);
    await makeRelay(outbox, sender).tick();

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(1, first);
    expect(sender).toHaveBeenNthCalledWith(2, second);
    expect(pending.map((item) => item.event.eventId)).toEqual([first.eventId]);
  });
});
