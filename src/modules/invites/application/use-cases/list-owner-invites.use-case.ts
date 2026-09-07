import type { InviteStatus } from "@prisma/client";
import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { OwnerInviteResponse } from "../dto/invite.dto";
import { toOwnerInviteResponse } from "../mappers/invite.mapper"; // Adjust import path if needed

export class ListOwnerInvitesUseCase {
  constructor(private readonly repository: InviteRepository) {}

  async execute(status?: InviteStatus): Promise<OwnerInviteResponse[]> {
    const invites = await this.repository.list(status);
    return invites.map((invite) => toOwnerInviteResponse(invite));
  }
}
