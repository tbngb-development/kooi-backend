import { env } from "../../../../shared/config/env";
import type { CreateInviteInput, CreateInviteOutput } from "../dto/invite.dto";
import { type TokenService } from "../interfaces/token-service.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

const INVITE_EXPIRY_HOURS = 168; // 7 days

export class CreateInviteUseCase {
  constructor(
    private readonly tokenService: TokenService,
    private readonly logger: Logger,
  ) {}

  execute(input: CreateInviteInput): CreateInviteOutput {
    const inviteToken = this.tokenService.generateInviteToken(
      input.tenantId,
      input.role,
      input.email,
      input.inviterId,
    );

    const inviteUrl = `${env.frontendUrl}/register?invite=${inviteToken}`;

    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    this.logger.info("Invite created", {
      action: "invite.create",
      tenantId: input.tenantId,
      inviterId: input.inviterId,
      role: input.role,
    });

    return {
      inviteToken,
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
