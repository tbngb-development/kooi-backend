import type { Job } from "bull";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { InvitationRepository } from "../../application/interfaces/invitation.repository";
import type { InvitationTokenService } from "../../application/interfaces/invitation-token.service";
import type { IInvitationEmailSender } from "../../application/interfaces/invitation-email-sender";
import {
  SEND_TEAM_INVITE_JOB,
  TEAM_INVITE_EMAIL_QUEUE,
  type InvitationEmailJob,
} from "../../application/interfaces/invitation-delivery-queue";
import { buildTeamInviteEmail } from "../mail/team-invite.template";

export { SEND_TEAM_INVITE_JOB, TEAM_INVITE_EMAIL_QUEUE };

export interface InvitationEmailWorkerDeps {
  repository: Pick<
    InvitationRepository,
    "findById" | "findPreviewContext" | "setTokenHash" | "touchSent"
  >;
  tokenService: InvitationTokenService;
  sender: IInvitationEmailSender;
  logger: Logger;
  frontendUrl: string;
}

/**
 * Bull consumer for team invitation emails.
 *
 * It receives only an invitation id, generates a fresh raw token, persists
 * its hash, sends the link, and marks the invitation as sent only after a
 * successful delivery. Failures are re-thrown for Bull to retry; the final
 * failure is logged as a dead letter.
 */
export class InvitationEmailWorker {
  private readonly log: Logger;
  private started = false;

  constructor(private readonly deps: InvitationEmailWorkerDeps) {
    this.log = deps.logger.child({ component: "InvitationEmailWorker" });
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const queue = getQueue(TEAM_INVITE_EMAIL_QUEUE);
    queue.process(SEND_TEAM_INVITE_JOB, 5, (job) => this.process(job));
    this.log.info("Invitation email worker started", {
      action: "invitation.email.worker.start",
    });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await getQueue(TEAM_INVITE_EMAIL_QUEUE).close();
  }

  async process(job: Job<InvitationEmailJob>): Promise<void> {
    const { invitationId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 3;

    try {
      const invitation = await this.deps.repository.findById(invitationId);
      if (!invitation) {
        this.log.warn("Invitation email skipped: invitation is gone", {
          action: "invitation.email.skip_missing",
          invitationId,
          attempt,
        });
        return;
      }

      if (
        invitation.status !== "PENDING" ||
        invitation.expiresAt.getTime() <= Date.now()
      ) {
        this.log.info("Invitation email skipped: no longer sendable", {
          action: "invitation.email.skip",
          invitationId,
          tenantId: invitation.tenantId,
          status: invitation.status,
          attempt,
        });
        return;
      }

      // A fresh token per attempt keeps the raw value out of Redis, logs and
      // the database. Its hash replaces the placeholder written by the API.
      const rawToken = this.deps.tokenService.generate();
      const tokenHash = this.deps.tokenService.hash(rawToken);
      await this.deps.repository.setTokenHash(invitationId, tokenHash);

      const context = await this.deps.repository.findPreviewContext(invitationId);
      const baseUrl = this.deps.frontendUrl.replace(/\/+$/, "");
      const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;
      const content = buildTeamInviteEmail({
        inviteUrl: acceptUrl,
        tenantName: context?.tenantName ?? "your workspace",
        inviterName: context?.inviterName ?? "A teammate",
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      });

      await this.deps.sender.send({ ...content, to: invitation.email });
      await this.deps.repository.touchSent(invitationId);

      this.log.info("Invitation email sent", {
        action: "invitation.email.sent",
        invitationId,
        tenantId: invitation.tenantId,
        attempt,
      });
    } catch (err) {
      const isFinalAttempt = attempt >= maxAttempts;
      this.log.error(
        isFinalAttempt
          ? "Invitation email failed after final attempt (dead letter)"
          : "Invitation email send failed",
        err,
        {
          action: isFinalAttempt
            ? "invitation.email.dead_letter"
            : "invitation.email.send_failed",
          invitationId,
          attempt,
          maxAttempts,
          isFinalAttempt,
        },
      );
      throw err;
    }
  }
}
