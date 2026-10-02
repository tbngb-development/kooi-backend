import { NotFoundError } from "../../../../shared/errors";
import { type MembershipInfo } from "../../../../shared/types";
import { type AuthRepository } from "../interfaces/auth-repository.interface";

export interface ProfileOutput {
  user: {
    id: string;
    email: string;
    name: string;
    isPlatformAdmin: boolean;
  };
  memberships: MembershipInfo[];
}

export class GetProfileUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(userId: string): Promise<ProfileOutput> {
    const user = await this.authRepository.findUserById(userId);

    if (!user) {
      throw new NotFoundError("User");
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships: user.memberships.map((m) => ({
        membershipId: m.id,
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        role: m.role,
      })),
    };
  }
}