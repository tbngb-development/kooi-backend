import cron from "node-cron";
import type { ExpireTrialPlansUseCase } from "../../application/use-cases/expire-trial-plans.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";

type ScheduledTask = ReturnType<typeof cron.schedule>;

export class TrialExpiryScheduler {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly expireTrialPlansUseCase: ExpireTrialPlansUseCase,
    private readonly logger: Logger,
    private readonly cronExpression = "0 * * * *", // Hourly check
  ) {}

  start(): void {
    if (this.task) {
      this.logger.warn("Trial expiry scheduler already running", {
        action: "scheduler.start",
        jobId: "trial-expiry",
      });
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      this.logger.error(
        "Invalid cron expression for trial expiry scheduler",
        undefined,
        {
          action: "scheduler.invalid_cron",
          jobId: "trial-expiry",
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
            "Trial expiry scheduler — previous run still in progress, skipping",
            {
              action: "scheduler.skip",
              jobId: "trial-expiry",
            },
          );
          return;
        }

        this.isRunning = true;
        try {
          const expiredCount = await this.expireTrialPlansUseCase.execute();
          if (expiredCount > 0) {
            this.logger.info("Trial expiry scheduler completed run", {
              action: "scheduler.run_complete",
              jobId: "trial-expiry",
              expiredCount,
            });
          }
        } catch (err) {
          this.logger.error("Trial expiry scheduler run failed", err, {
            action: "scheduler.run_failed",
            jobId: "trial-expiry",
          });
        } finally {
          this.isRunning = false;
        }
      },
      { timezone: "UTC" },
    );

    this.logger.info("Trial expiry scheduler started", {
      action: "scheduler.start",
      jobId: "trial-expiry",
      cronExpression: this.cronExpression,
    });
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.logger.info("Trial expiry scheduler stopped", {
        action: "scheduler.stop",
        jobId: "trial-expiry",
      });
    }
  }
}
