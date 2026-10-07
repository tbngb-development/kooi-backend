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
    private readonly retentionDays = 30,
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

    this.task = cron.schedule(
      this.cronExpression,
      async () => {
        if (this.isRunning) {
          this.logger.warn(
            "Refresh token cleanup scheduler — previous run still in progress, skipping",
            {
              action: "scheduler.skip",
              jobId: "refresh-token-cleanup",
            },
          );
          return;
        }

        this.isRunning = true;
        try {
          const deleted = await this.cleanupService.cleanup(this.retentionDays);
          this.logger.info("Completed scheduled refresh token cleanup run", {
            action: "scheduler.run_completed",
            jobId: "refresh-token-cleanup",
            deletedTokensCount: deleted,
          });
        } catch (err) {
          this.logger.error(
            "Refresh token cleanup scheduler unhandled error",
            err,
            {
              action: "scheduler.error",
              jobId: "refresh-token-cleanup",
            },
          );
        } finally {
          this.isRunning = false;
        }
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
