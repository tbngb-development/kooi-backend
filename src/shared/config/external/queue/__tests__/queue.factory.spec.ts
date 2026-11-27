import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class FakeRedis {
    static instances: FakeRedis[] = [];
    status = "ready";
    options: Record<string, unknown>;

    constructor(url: string, options: Record<string, unknown> = {}) {
      void url;
      this.options = options;
      FakeRedis.instances.push(this);
    }

    on = vi.fn(() => this);
    once = vi.fn(() => this);
    removeListener = vi.fn(() => this);
    quit = vi.fn(async () => {
      this.status = "end";
    });
    disconnect = vi.fn(() => {
      this.status = "end";
    });
  }

  class FakeQueue {
    static instances: FakeQueue[] = [];
    static closeImpl: ((queue: FakeQueue) => Promise<void>) | null = null;

    name: string;
    options: {
      createClient: (type: "client" | "subscriber" | "bclient") => FakeRedis;
    };
    client: FakeRedis;
    subscriber: FakeRedis;
    bclient: FakeRedis | null = null;
    status = "ready";
    close = vi.fn(() => {
      this.status = "closed";
      return FakeQueue.closeImpl?.(this) ?? Promise.resolve();
    });
    on = vi.fn(() => this);

    constructor(
      name: string,
      options: {
        createClient: (type: "client" | "subscriber" | "bclient") => FakeRedis;
      },
    ) {
      this.name = name;
      this.options = options;
      this.client = options.createClient("client");
      this.subscriber = options.createClient("subscriber");
      FakeQueue.instances.push(this);
    }

    startProcessor(): void {
      this.bclient = this.options.createClient("bclient");
    }
  }

  return { FakeRedis, FakeQueue };
});

vi.mock("ioredis", () => ({ default: harness.FakeRedis }));
vi.mock("bull", () => ({ default: harness.FakeQueue }));

import { closeAllQueues, getQueue } from "../queue.factory";

type FakeQueueInstance = InstanceType<typeof harness.FakeQueue>;

const getFakeQueue = (name: string): FakeQueueInstance =>
  getQueue(name) as unknown as FakeQueueInstance;

describe("queue.factory connection lifecycle", () => {
  beforeEach(() => {
    harness.FakeRedis.instances.length = 0;
    harness.FakeQueue.instances.length = 0;
    harness.FakeQueue.closeImpl = null;
  });

  afterEach(async () => {
    await closeAllQueues();
  });

  it("disconnects blocking clients when all queues are closed", async () => {
    const queue = getFakeQueue("batch-processing");
    queue.startProcessor();
    const bclient = queue.bclient;

    await closeAllQueues();

    expect(bclient?.status).toBe("end");
  });

  it("uses bounded retries for the command client and unlimited retries for subscriber and blocking clients", () => {
    const queue = getFakeQueue("batch-processing");
    queue.startProcessor();

    expect(queue.client.options.maxRetriesPerRequest).not.toBe(null);
    expect(queue.subscriber.options.maxRetriesPerRequest).toBe(null);
    expect(queue.bclient?.options.maxRetriesPerRequest).toBe(null);
  });

  it("closes every queue even when one queue takes longer to close", async () => {
    getFakeQueue("slow");
    const fast = getFakeQueue("fast");
    let releaseSlow!: () => void;
    const slowClose = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    harness.FakeQueue.closeImpl = (queue) =>
      queue.name === "slow" ? slowClose : Promise.resolve();

    const closing = closeAllQueues();
    await Promise.resolve();
    expect(fast.status).toBe("closed");

    releaseSlow();
    await closing;
  });
});
