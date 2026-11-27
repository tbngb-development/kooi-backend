import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class FakeRedis {
    status = "ready";
    on = vi.fn(() => this);
    quit = vi.fn(async () => {
      this.status = "end";
    });
    disconnect = vi.fn(() => {
      this.status = "end";
    });
  }

  return { FakeRedis };
});

vi.mock("ioredis", () => ({ default: harness.FakeRedis }));

import redis, { disconnectRedis } from "../redis";

describe("disconnectRedis", () => {
  it("force-disconnects and clears state when graceful quit fails", async () => {
    const instance = redis as unknown as InstanceType<typeof harness.FakeRedis>;
    instance.quit.mockRejectedValueOnce(new Error("Connection is closed."));

    await expect(disconnectRedis()).resolves.toBeUndefined();
    expect(instance.status).toBe("end");

    const quitCallsAfterFailure = instance.quit.mock.calls.length;
    await disconnectRedis();
    expect(instance.quit.mock.calls.length).toBe(quitCallsAfterFailure);
  });
});
