import type { InviteRepository } from "../interfaces/invite-repository.interface";
import {
  InviteNotFoundError,
  InviteAlreadyAcceptedError,
} from "../../domain/errors/invite.errors";

export class RevokeOwnerInviteUseCase {
  constructor(private readonly inviteRepo: InviteRepository) {}

  async execute(id: string): Promise<{ success: boolean }> {
    const invite = await this.inviteRepo.findById(id);
    if (!invite) throw new InviteNotFoundError();
    if (invite.status === "ACCEPTED") throw new InviteAlreadyAcceptedError();

    await this.inviteRepo.markRevoked(id);
    return { success: true };
  }
}
