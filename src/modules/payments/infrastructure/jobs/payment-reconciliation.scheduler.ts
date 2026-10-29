import cron from "node-cron";
import type { ReconcileStalePaymentsUseCase } from "../../application/use-cases/reconcile-stale-payments.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";

type ScheduledTask = ReturnType<typeof cron.schedule>;

export class PaymentReconciliationScheduler {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly reconcileStalePayments: ReconcileStalePaymentsUseCase,
    private readonly logger: Logger,
    private readonly cronExpression = "*/15 * * * *", // Every 15 minutes
    private readonly timeoutMinutes = 30,
  ) {}

  start(): void {
    if (this.task) {
      this.logger.warn("Payment reconciliation scheduler already running", {
        action: "scheduler.start",
        jobId: "payment-reconciliation",
      });
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      this.logger.error(
        "Invalid cron expression for payment reconciliation scheduler",
        undefined,
        {
          action: "scheduler.invalid_cron",
          jobId: "payment-reconciliation",
          cronExpression: this.cronExpression,
        },
      );
      return;
    }

    // 1. Run an immediate sweep on startup to reconcile existing stale records
    this.runSweep().catch((err) => {
      this.logger.error("Initial payment reconciliation sweep failed", err, {
        action: "scheduler.initial_sweep_failed",
        jobId: "payment-reconciliation",
      });
    });

    // 2. Schedule recurring cron runs
    this.task = cron.schedule(
      this.cronExpression,
      async () => {
        await this.runSweep();
      },
      { timezone: "UTC" },
    );

    this.logger.info("Payment reconciliation scheduler started", {
      action: "scheduler.start",
      jobId: "payment-reconciliation",
      cronExpression: this.cronExpression,
      timeoutMinutes: this.timeoutMinutes,
    });
  }

  private async runSweep(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        "Payment reconciliation scheduler — previous run still in progress, skipping",
        {
          action: "scheduler.skip",
          jobId: "payment-reconciliation",
        },
      );
      return;
    }

    this.isRunning = true;
    try {
      const stats = await this.reconcileStalePayments.execute({
        timeoutMinutes: this.timeoutMinutes,
        batchSize: 50,
      });

      if (stats.scannedCount > 0) {
        this.logger.info("Payment reconciliation sweep completed run", {
          action: "scheduler.run_complete",
          jobId: "payment-reconciliation",
          ...stats,
        });
      }
    } catch (err) {
      this.logger.error("Payment reconciliation sweep run failed", err, {
        action: "scheduler.run_failed",
        jobId: "payment-reconciliation",
      });
    } finally {
      this.isRunning = false;
    }
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.logger.info("Payment reconciliation scheduler stopped", {
        action: "scheduler.stop",
        jobId: "payment-reconciliation",
      });
    }
  }
}

