import type { RegisterTenantOwnerOutput } from "../application/dto/register.dto";
import type { LoginOutput } from "../application/dto/login.dto";
import type { SelectTenantOutput } from "../application/dto/select-tenant.dto";
import type {
  CreateInviteOutput,
  AcceptInviteOutput,
} from "../application/dto/invite.dto";
import type { ProfileOutput } from "../application/use-cases/get-profile.use-case";

// ── Response contract types (tokens removed — delivered via httpOnly cookies) ──

export interface RegisterResponse {
  user: RegisterTenantOwnerOutput["user"];
  tenant: RegisterTenantOwnerOutput["tenant"];
  membership: RegisterTenantOwnerOutput["membership"];
}

export interface LoginResponse {
  requiresTenantSelection: boolean;
  user: LoginOutput["user"];
  memberships: LoginOutput["memberships"];
}

export interface SelectTenantResponse {
  membership: SelectTenantOutput["membership"];
}

export interface RefreshResponse {
  refreshed: true;
}

export interface ProfileResponse {
  user: ProfileOutput["user"];
  memberships: ProfileOutput["memberships"];
}

export interface InviteResponse {
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface AcceptInviteResponse {
  user: AcceptInviteOutput["user"];
  membership: AcceptInviteOutput["membership"];
}

// ── Mappers ────────────────────────────────────────────────────────────────

export class AuthMapper {
  static toRegisterResponse(
    output: RegisterTenantOwnerOutput,
  ): RegisterResponse {
    return {
      user: output.user,
      tenant: output.tenant,
      membership: output.membership,
    };
  }

  static toLoginResponse(output: LoginOutput): LoginResponse {
    return {
      requiresTenantSelection: output.requiresTenantSelection,
      user: output.user,
      memberships: output.memberships,
    };
  }

  static toSelectTenantResponse(
    output: SelectTenantOutput,
  ): SelectTenantResponse {
    return {
      membership: output.membership,
    };
  }

  static toRefreshResponse(): RefreshResponse {
    return { refreshed: true };
  }

  static toProfileResponse(output: ProfileOutput): ProfileResponse {
    return {
      user: output.user,
      memberships: output.memberships,
    };
  }

  static toInviteResponse(output: CreateInviteOutput): InviteResponse {
    return {
      inviteToken: output.inviteToken,
      inviteUrl: output.inviteUrl,
      expiresAt: output.expiresAt,
    };
  }

  static toAcceptInviteResponse(
    output: AcceptInviteOutput,
  ): AcceptInviteResponse {
    return {
      user: output.user,
      membership: output.membership,
    };
  }
}
