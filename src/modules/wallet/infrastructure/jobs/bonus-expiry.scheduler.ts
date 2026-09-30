import cron from "node-cron";
import type { ExpireBonusCreditsUseCase } from "../../application/use-cases/expire-bonus-credits.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";

type ScheduledTask = ReturnType<typeof cron.schedule>;

/**
 * Schedules periodic bonus credit expiry checks using node-cron.
 *
 * Lifecycle:
 *  - Call start() after the Express server is listening.
 *  - Call stop() during graceful shutdown (SIGINT/SIGTERM).
 *
 * The job is idempotent and safe to restart — duplicate runs
 * are handled by the use case's row-level locking and idempotency keys.
 */
export class BonusExpiryScheduler {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly expireBonusCreditsUseCase: ExpireBonusCreditsUseCase,
    private readonly logger: Logger,
    private readonly cronExpression = "*/15 * * * *",
  ) {}

  start(): void {
    if (this.task) {
      this.logger.warn("Bonus expiry scheduler already running", {
        action: "scheduler.start",
        jobId: "bonus-expiry",
      });
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      this.logger.error(
        "Invalid cron expression for bonus expiry scheduler",
        undefined,
        {
          action: "scheduler.invalid_cron",
          jobId: "bonus-expiry",
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
            "Bonus expiry scheduler — previous run still in progress, skipping",
            {
              action: "scheduler.skip",
              jobId: "bonus-expiry",
            },
          );
          return;
        }

        this.isRunning = true;
        try {
          await this.expireBonusCreditsUseCase.execute();
        } catch (err) {
          this.logger.error("Bonus expiry scheduler unhandled error", err, {
            action: "scheduler.error",
            jobId: "bonus-expiry",
          });
        } finally {
          this.isRunning = false;
        }
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    this.logger.info("Bonus expiry scheduler started", {
      action: "scheduler.started",
      jobId: "bonus-expiry",
      cronExpression: this.cronExpression,
      timezone: "Asia/Kolkata",
    });
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.logger.info("Bonus expiry scheduler stopped", {
        action: "scheduler.stopped",
        jobId: "bonus-expiry",
      });
    }
  }
}
