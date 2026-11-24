import type { Queue } from "bull";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import type { InvitationService } from "../../application/services/invitation.service";

export const INVITATION_EXPIRY_QUEUE = "invitation-expiry";
export const EXPIRE_STALE_JOB = "expire-stale";

/**
 * Bull repeatable job that flips PENDING invitations past their expiry to
 * EXPIRED. The sweeper is idempotent, so duplicate runs are harmless.
 */
export class InvitationExpiryScheduler {
  private started = false;

  constructor(
    private readonly service: InvitationService,
    private readonly logger: Logger,
  ) {}

  start(cronExpression = "*/15 * * * *"): void {
    if (this.started) {
      this.logger.warn("Invitation expiry scheduler already started", {
        action: "invitation.expiry.scheduler.already_started",
      });
      return;
    }
    this.started = true;

    const queue: Queue = getQueue(INVITATION_EXPIRY_QUEUE);

    queue.process(EXPIRE_STALE_JOB, 1, async () => {
      const expired = await this.service.expireStale();
      this.logger.info("Invitation expiry sweep completed", {
        action: "invitation.expiry.sweep",
        count: expired,
      });
    });

    queue.on("failed", (job, err) => {
      this.logger.error(
        `Invitation expiry job failed: ${job?.id ?? "unknown"}: ${err.message}`,
        err,
        { action: "invitation.expiry.job.failed" },
      );
    });

    void queue
      .add(
        EXPIRE_STALE_JOB,
        {},
        {
          repeat: { cron: cronExpression },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      )
      .then(() => {
        this.logger.info("Invitation expiry scheduler started", {
          action: "invitation.expiry.scheduler.start",
          cron: cronExpression,
        });
      })
      .catch((err: Error) => {
        this.logger.error(
          `Failed to schedule invitation expiry: ${err.message}`,
          err,
          { action: "invitation.expiry.scheduler.schedule_failed" },
        );
      });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await getQueue(INVITATION_EXPIRY_QUEUE).close();
  }
}
