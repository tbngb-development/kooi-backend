import type { Queue } from "bull";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import {
  SEND_TEAM_INVITE_JOB,
  TEAM_INVITE_EMAIL_QUEUE,
  type IInvitationDeliveryQueue,
  type InvitationEmailJob,
} from "../../application/interfaces/invitation-delivery-queue";

/** Enqueues delivery by invitation id only — no token ever enters Redis. */
export class BullInvitationDeliveryQueue implements IInvitationDeliveryQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = getQueue(TEAM_INVITE_EMAIL_QUEUE);
  }

  async enqueue(job: InvitationEmailJob): Promise<void> {
    await this.queue.add(SEND_TEAM_INVITE_JOB, job, {
      attempts: 4,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
