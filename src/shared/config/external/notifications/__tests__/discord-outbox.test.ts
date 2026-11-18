import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../../../logging/logger.interface";
import type { DiscordEvent } from "../discordevents-publisher";
import { OutboxDiscordEventsPublisher } from "../outbox-publisher";
import { DiscordOutboxRelay } from "../outbox-relay";
import type {
  IDiscordOutboxRepository,
  PendingDiscordEvent,
} from "../outbox-repository";

const event: DiscordEvent = {
  eventId: "payment.completed:rec_1:success",
  eventType: "payment.completed",
  eventVersion: 1,
  occurredAt: "2026-11-17T10:00:00.000Z",
  tenantId: "tenant-1",
  source: "kooi-backend",
  data: { rechargeId: "rec_1", amountPaisa: 49900 },
};

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function makeOutbox(): IDiscordOutboxRepository {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    findPending: vi.fn().mockResolvedValue([]),
    markPublished: vi.fn().mockResolvedValue(undefined),
  };
}

describe("OutboxDiscordEventsPublisher", () => {
  it("appends the envelope stamped with the environment when enabled", async () => {
    const outbox = makeOutbox();
    await new OutboxDiscordEventsPublisher(
      outbox,
      makeLogger(),
      true,
      "staging",
    ).publish(event);

    expect(outbox.append).toHaveBeenCalledWith({
      ...event,
      environment: "staging",
    });
  });

  it("keeps an environment already carried by the event", async () => {
    const outbox = makeOutbox();
    await new OutboxDiscordEventsPublisher(
      outbox,
      makeLogger(),
      true,
      "staging",
    ).publish({ ...event, environment: "local-dev" });

    expect(outbox.append).toHaveBeenCalledWith({
      ...event,
      environment: "local-dev",
    });
  });

  it("does nothing when disabled", async () => {
    const outbox = makeOutbox();
    await new OutboxDiscordEventsPublisher(
      outbox,
      makeLogger(),
      false,
      "staging",
    ).publish(event);

    expect(outbox.append).not.toHaveBeenCalled();
  });

  it("never propagates an outbox failure to the business operation", async () => {
    const outbox = makeOutbox();
    vi.mocked(outbox.append).mockRejectedValueOnce(new Error("db down"));
    const logger = makeLogger();

    await expect(
      new OutboxDiscordEventsPublisher(
        outbox,
        logger,
        true,
        "staging",
      ).publish(event),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("DiscordOutboxRelay", () => {
  let outbox: IDiscordOutboxRepository;
  let sender: { publishOrThrow: (event: DiscordEvent) => Promise<void> };
  let logger: Logger;

  beforeEach(() => {
    outbox = makeOutbox();
    sender = {
      publishOrThrow: vi.fn().mockResolvedValue(undefined) as unknown as (
        event: DiscordEvent,
      ) => Promise<void>,
    };
    logger = makeLogger();
  });

  function makeRelay(enabled = true) {
    return new DiscordOutboxRelay({
      outbox,
      sender,
      logger,
      enabled,
      pollMs: 60_000,
      batchSize: 10,
    });
  }

  it("delivers pending events and marks them published", async () => {
    const pending: PendingDiscordEvent[] = [{ id: "outbox-1", event }];
    vi.mocked(outbox.findPending).mockResolvedValueOnce(pending);

    await makeRelay().tick();

    expect(sender.publishOrThrow).toHaveBeenCalledWith(event);
    expect(outbox.markPublished).toHaveBeenCalledWith("outbox-1");
  });

  it("leaves an event unpublished when delivery fails", async () => {
    vi.mocked(outbox.findPending).mockResolvedValueOnce([
      { id: "outbox-1", event },
    ]);
    vi.mocked(sender.publishOrThrow).mockRejectedValueOnce(
      new Error("service down"),
    );

    await makeRelay().tick();

    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not read the outbox when disabled", async () => {
    await makeRelay(false).tick();

    expect(outbox.findPending).not.toHaveBeenCalled();
  });

  it("skips a tick while a previous tick is still in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(outbox.findPending).mockImplementationOnce(async () => {
      await gate;
      return [];
    });
    const relay = makeRelay();

    const first = relay.tick();
    await relay.tick();
    release();
    await first;

    expect(outbox.findPending).toHaveBeenCalledTimes(1);
  });
});
