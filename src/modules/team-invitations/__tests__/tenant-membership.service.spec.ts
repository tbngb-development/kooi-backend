import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantMembershipService } from "../application/services/tenant-membership.service";
import {
  RoleNotInvitableError,
  TeamSeatLimitError,
} from "../domain/errors/invitation.errors";
import type {
  SeatLockContext,
  TenantMembershipRepository,
} from "../application/interfaces/tenant-membership.repository";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";

const TENANT_ID = "tenant-1";
const INVITER_ID = "user-inviter";

type PlanRepo = Pick<PlanRepository, "getActivePlanForTenant">;

function makeLockContext(
  overrides: Partial<SeatLockContext> = {},
): SeatLockContext {
  return {
    countActiveMembers: vi.fn().mockResolvedValue(0),
    countPendingInvites: vi.fn().mockResolvedValue(0),
    addMember: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRepo(ctx: SeatLockContext = makeLockContext()) {
  return {
    countActiveMembers: vi.fn().mockResolvedValue(0),
    countPendingInvites: vi.fn().mockResolvedValue(0),
    addMember: vi.fn().mockResolvedValue(undefined),
    withSeatLock: vi.fn(
      (_tenantId: string, work: (c: SeatLockContext) => Promise<unknown>) =>
        work(ctx),
    ) as TenantMembershipRepository["withSeatLock"],
  } satisfies TenantMembershipRepository;
}

function makePlanRepo(maxTeamMembers: number | null): PlanRepo {
  return {
    getActivePlanForTenant: vi.fn().mockResolvedValue(
      maxTeamMembers === null
        ? null
        : ({ maxTeamMembers } as Awaited<
            ReturnType<PlanRepo["getActivePlanForTenant"]>
          >),
    ),
  };
}

describe("TenantMembershipService", () => {
  let repo: ReturnType<typeof makeRepo>;
  let ctx: SeatLockContext;
  let service: TenantMembershipService;

  function build(maxTeamMembers: number | null) {
    ctx = makeLockContext();
    repo = makeRepo(ctx);
    service = new TenantMembershipService(repo, makePlanRepo(maxTeamMembers));
  }

  beforeEach(() => {
    build(5);
  });

  describe("role checks", () => {
    it("allows an OWNER to invite an ADMIN", async () => {
      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "OWNER", "ADMIN"),
      ).resolves.toBeUndefined();
    });

    it("rejects an ADMIN inviting another ADMIN", async () => {
      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "ADMIN", "ADMIN"),
      ).rejects.toBeInstanceOf(RoleNotInvitableError);
    });

    it("rejects a USER inviting anyone", async () => {
      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "USER", "USER"),
      ).rejects.toBeInstanceOf(RoleNotInvitableError);
    });

    it("does not acquire the seat lock when the role is not invitable", async () => {
      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "ADMIN", "OWNER"),
      ).rejects.toBeInstanceOf(RoleNotInvitableError);
      expect(repo.withSeatLock).not.toHaveBeenCalled();
    });

    it("rejects an invalid actor role defensively", async () => {
      await expect(
        service.assertCanInvite(
          TENANT_ID,
          INVITER_ID,
          "SUPERADMIN" as "OWNER",
          "USER",
        ),
      ).rejects.toBeInstanceOf(RoleNotInvitableError);
    });
  });

  describe("assertCanInvite seat rules", () => {
    it("allows an invite on a tenant with no active plan (unlimited)", async () => {
      build(null);
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(100);
      vi.mocked(ctx.countPendingInvites).mockResolvedValue(50);

      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "OWNER", "USER"),
      ).resolves.toBeUndefined();
    });

    it("allows an invite when below the limit", async () => {
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(2);
      vi.mocked(ctx.countPendingInvites).mockResolvedValue(1);

      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "OWNER", "USER"),
      ).resolves.toBeUndefined();
    });

    it("rejects an invite when pending invites consume the last seat", async () => {
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(4);
      vi.mocked(ctx.countPendingInvites).mockResolvedValue(1);

      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "OWNER", "USER"),
      ).rejects.toBeInstanceOf(TeamSeatLimitError);
    });

    it("rejects an invite when over the limit", async () => {
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(6);
      vi.mocked(ctx.countPendingInvites).mockResolvedValue(1);

      await expect(
        service.assertCanInvite(TENANT_ID, INVITER_ID, "OWNER", "USER"),
      ).rejects.toBeInstanceOf(TeamSeatLimitError);
    });

    it("performs the seat check inside the tenant row lock using lock-scoped counts", async () => {
      await service.assertCanInvite(TENANT_ID, INVITER_ID, "OWNER", "USER");

      expect(repo.withSeatLock).toHaveBeenCalledTimes(1);
      expect(repo.withSeatLock).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Function),
      );
      expect(ctx.countActiveMembers).toHaveBeenCalledTimes(1);
      expect(ctx.countPendingInvites).toHaveBeenCalledTimes(1);
      expect(repo.countActiveMembers).not.toHaveBeenCalled();
    });
  });

  describe("assertCanAccept seat rules", () => {
    it("allows acceptance on an unlimited plan", async () => {
      build(null);
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(100);

      await expect(
        service.assertCanAccept(TENANT_ID),
      ).resolves.toBeUndefined();
    });

    it("allows acceptance when active members are below the limit", async () => {
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(4);

      await expect(
        service.assertCanAccept(TENANT_ID),
      ).resolves.toBeUndefined();
    });

    it("rejects acceptance when active members are at the limit", async () => {
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(5);

      await expect(service.assertCanAccept(TENANT_ID)).rejects.toBeInstanceOf(
        TeamSeatLimitError,
      );
    });

    it("rejects acceptance when active members are over the limit", async () => {
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(6);

      await expect(service.assertCanAccept(TENANT_ID)).rejects.toBeInstanceOf(
        TeamSeatLimitError,
      );
    });

    it("does not count pending invites at accept time", async () => {
      vi.mocked(ctx.countActiveMembers).mockResolvedValue(4);
      vi.mocked(ctx.countPendingInvites).mockResolvedValue(20);

      await expect(
        service.assertCanAccept(TENANT_ID),
      ).resolves.toBeUndefined();
      expect(ctx.countPendingInvites).not.toHaveBeenCalled();
    });

    it("performs the accept seat check inside the tenant row lock", async () => {
      await service.assertCanAccept(TENANT_ID);

      expect(repo.withSeatLock).toHaveBeenCalledTimes(1);
      expect(repo.withSeatLock).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Function),
      );
    });
  });

  describe("getSeatAvailability", () => {
    it("reports an unlimited plan", async () => {
      build(null);
      repo.countActiveMembers.mockResolvedValue(3);
      repo.countPendingInvites.mockResolvedValue(2);

      await expect(service.getSeatAvailability(TENANT_ID)).resolves.toEqual({
        used: 3,
        pending: 2,
        limit: null,
        available: null,
      });
    });

    it("reports remaining seats under the limit", async () => {
      repo.countActiveMembers.mockResolvedValue(2);
      repo.countPendingInvites.mockResolvedValue(1);

      await expect(service.getSeatAvailability(TENANT_ID)).resolves.toEqual({
        used: 2,
        pending: 1,
        limit: 5,
        available: 2,
      });
    });

    it("clamps available seats to zero at and over the limit", async () => {
      repo.countActiveMembers.mockResolvedValue(4);
      repo.countPendingInvites.mockResolvedValue(1);
      await expect(service.getSeatAvailability(TENANT_ID)).resolves.toEqual({
        used: 4,
        pending: 1,
        limit: 5,
        available: 0,
      });

      repo.countActiveMembers.mockResolvedValue(6);
      await expect(service.getSeatAvailability(TENANT_ID)).resolves.toEqual({
        used: 6,
        pending: 1,
        limit: 5,
        available: 0,
      });
    });
  });

  describe("addMember", () => {
    it("delegates to the repository with the tenant and role", async () => {
      await service.addMember(TENANT_ID, "user-new", "USER");

      expect(repo.addMember).toHaveBeenCalledTimes(1);
      expect(repo.addMember).toHaveBeenCalledWith(TENANT_ID, {
        userId: "user-new",
        role: "USER",
      });
    });

    it("supports adding a member inside an existing lock context", async () => {
      await ctx.addMember({ userId: "user-new", role: "ADMIN" });

      expect(ctx.addMember).toHaveBeenCalledWith({
        userId: "user-new",
        role: "ADMIN",
      });
    });
  });

  describe("countActiveMembers", () => {
    it("delegates to the repository", async () => {
      repo.countActiveMembers.mockResolvedValue(7);

      await expect(service.countActiveMembers(TENANT_ID)).resolves.toBe(7);
      expect(repo.countActiveMembers).toHaveBeenCalledWith(TENANT_ID);
    });
  });
});
