import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  close: vi.fn(() => Promise.reject(new Error("close failed"))),
}));

vi.mock("../../../../../shared/config/external/queue/queue.factory", () => ({
  getQueue: () => ({
    close: harness.close,
    process: vi.fn(),
    on: vi.fn(),
  }),
}));

import { ClassifierExtractionScheduler } from "../classifier-extraction.scheduler";

describe("ClassifierExtractionScheduler.stop", () => {
  it("logs a failed queue close instead of leaking a rejected promise", async () => {
    const logger = {
      child: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };
    logger.child.mockReturnValue(logger);

    const scheduler = new ClassifierExtractionScheduler(
      {} as never,
      logger as never,
    );
    scheduler.stop();
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalled();
  });
});
