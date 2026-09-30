import cron from "node-cron";
import type { ExpireBonusCreditsUseCase } from "../../application/use-cases/expire-bonus-credits.use-case";

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
    private readonly cronExpression = "*/15 * * * *", // Every 15 minutes
  ) {}

  start(): void {
    if (this.task) {
      console.warn("[BonusExpiryScheduler] Already running");
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      console.error(
        `[BonusExpiryScheduler] Invalid cron expression: ${this.cronExpression}`,
      );
      return;
    }

    this.task = cron.schedule(
      this.cronExpression,
      async () => {
        // Prevent overlapping runs
        if (this.isRunning) {
          console.warn(
            "[BonusExpiryScheduler] Previous run still in progress, skipping",
          );
          return;
        }

        this.isRunning = true;
        try {
           // ── Optional: Add this line to see the tick every minute in dev ──
          // console.log(`[BonusExpiryScheduler] Cron tick executed at ${new Date().toLocaleTimeString()}`);
          await this.expireBonusCreditsUseCase.execute();
        } catch (err) {
          console.error("[BonusExpiryScheduler] Unhandled error:", err);
        } finally {
          this.isRunning = false;
        }
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    console.log(
      `[BonusExpiryScheduler] Started (cron: ${this.cronExpression}, tz: Asia/Kolkata)`,
    );
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("[BonusExpiryScheduler] Stopped");
    }
  }
}
