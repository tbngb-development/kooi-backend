import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  validate: vi.fn().mockReturnValue(true),
}));

vi.mock("node-cron", () => ({
  default: { schedule: mocks.schedule, validate: mocks.validate },
}));

import { CallingWindowScheduler } from "../calling-window.scheduler";

describe("CallingWindowScheduler", () => {
  it("runs the close use case on each cron tick and stops the task cleanly", async () => {
    let tick: () => Promise<void> = async () => {};
    const task = { stop: vi.fn() };
    mocks.schedule.mockImplementation((_expression, callback) => {
      tick = callback;
      return task;
    });

    const execute = vi.fn().mockResolvedValue({
      scanned: 0,
      paused: [],
      scheduled: [],
      skipped: [],
      failed: [],
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const scheduler = new CallingWindowScheduler(
      { execute } as never,
      logger as never,
    );

    scheduler.start();
    await tick();

    expect(execute).toHaveBeenCalledTimes(1);
    scheduler.stop();
    expect(task.stop).toHaveBeenCalledTimes(1);
  });
});
