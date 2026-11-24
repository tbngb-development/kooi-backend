import cron from "node-cron";
import type { CloseCallingWindowsUseCase } from "../../application/use-cases/close-calling-windows.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";

type ScheduledTask = ReturnType<typeof cron.schedule>;

/**
 * Periodically closes expired calling windows. Uses a persisted marker in the
 * use case, so overlapping/restarted ticks are safe.
 */
export class CallingWindowScheduler {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly closeWindows: CloseCallingWindowsUseCase,
    private readonly logger?: Logger,
    private readonly cronExpression = "*/5 * * * *",
  ) {}

  start(): void {
    if (this.task) {
      this.logger?.warn("Calling window scheduler already running", {
        action: "scheduler.start",
        jobId: "calling-window",
      });
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      this.logger?.error(
        "Invalid cron expression for calling window scheduler",
        undefined,
        {
          action: "scheduler.invalid_cron",
          jobId: "calling-window",
          cronExpression: this.cronExpression,
        },
      );
      return;
    }

    this.task = cron.schedule(
      this.cronExpression,
      async () => {
        if (this.isRunning) {
          this.logger?.warn("Calling window scheduler tick skipped", {
            action: "scheduler.skip",
            jobId: "calling-window",
          });
          return;
        }
        this.isRunning = true;
        try {
          const result = await this.closeWindows.execute();
          if (result.paused.length || result.scheduled.length || result.failed.length) {
            this.logger?.info("Calling window close tick completed", {
              action: "batch.calling_window.tick",
              ...result,
            });
          }
        } catch (err) {
          this.logger?.error("Calling window scheduler tick failed", err, {
            action: "scheduler.error",
            jobId: "calling-window",
          });
        } finally {
          this.isRunning = false;
        }
      },
      { timezone: "Asia/Kolkata" },
    );
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }
}
