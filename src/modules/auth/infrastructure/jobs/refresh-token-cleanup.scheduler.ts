import cron from "node-cron";
import type { RefreshTokenCleanupService } from "../services/refresh-token-cleanup.service";
import type { Logger } from "../../../../shared/logging/logger.interface";

type ScheduledTask = ReturnType<typeof cron.schedule>;

export class RefreshTokenCleanupScheduler {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly cleanupService: RefreshTokenCleanupService,
    private readonly logger: Logger,
    private readonly cronExpression = "0 3 * * *", // Default: Daily at 3:00 AM
    private readonly retentionDays = 1, // Default: 1 day (24 hours) for revoked tokens
  ) {}

  start(): void {
    if (this.task) {
      this.logger.warn("Refresh token cleanup scheduler is already running", {
        action: "scheduler.start",
        jobId: "refresh-token-cleanup",
      });
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      this.logger.error(
        "Invalid cron expression for refresh token cleanup scheduler",
        undefined,
        {
          action: "scheduler.invalid_cron",
          jobId: "refresh-token-cleanup",
          cronExpression: this.cronExpression,
        },
      );
      return;
    }

    // Run startup sweep asynchronously without blocking server start
    this.runCleanup("scheduler.startup").catch((err) => {
      this.logger.error("Refresh token cleanup scheduler startup run error", err, {
        action: "scheduler.startup_error",
        jobId: "refresh-token-cleanup",
      });
    });

    this.task = cron.schedule(
      this.cronExpression,
      async () => {
        await this.runCleanup("scheduler.cron");
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    this.logger.info("Refresh token cleanup scheduler started", {
      action: "scheduler.started",
      jobId: "refresh-token-cleanup",
      cronExpression: this.cronExpression,
      timezone: "Asia/Kolkata",
    });
  }

  private async runCleanup(trigger: string): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        "Refresh token cleanup scheduler — previous run still in progress, skipping",
        {
          action: "scheduler.skip",
          jobId: "refresh-token-cleanup",
          trigger,
        },
      );
      return;
    }

    this.isRunning = true;
    try {
      const deleted = await this.cleanupService.cleanup(this.retentionDays);
      this.logger.info("Completed refresh token cleanup run", {
        action: "scheduler.run_completed",
        jobId: "refresh-token-cleanup",
        trigger,
        deletedTokensCount: deleted,
      });
    } catch (err) {
      this.logger.error(
        "Refresh token cleanup scheduler unhandled error",
        err,
        {
          action: "scheduler.error",
          jobId: "refresh-token-cleanup",
          trigger,
        },
      );
    } finally {
      this.isRunning = false;
    }
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.logger.info("Refresh token cleanup scheduler stopped", {
        action: "scheduler.stopped",
        jobId: "refresh-token-cleanup",
      });
    }
  }
}
