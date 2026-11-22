import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bull";
import {
  InvitationEmailWorker,
  type InvitationEmailWorkerDeps,
} from "../infrastructure/jobs/invitation-email.worker";
import type { InvitationRecord } from "../application/dto/invitation.dto";
import type { Logger } from "../../../shared/logging/logger.interface";

const NOW = new Date("2026-01-10T00:00:00.000Z");
const EXPIRES = new Date("2099-01-17T00:00:00.000Z");

function makeInvite(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "invite-1",
    tenantId: "tenant-1",
    email: "alice@example.com",
    role: "USER",
    tokenHash: "hash-old",
    status: "PENDING",
    invitedById: "user-inviter",
    expiresAt: EXPIRES,
    acceptedAt: null,
    acceptedByUserId: null,
    revokedAt: null,
    lastSentAt: null,
    sendCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeJob(
  invitationId = "invite-1",
  overrides: { attemptsMade?: number; attempts?: number } = {},
): Job<{ invitationId: string }> {
  return {
    id: "job-1",
    data: { invitationId },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job<{ invitationId: string }>;
}

type Harness = {
  worker: InvitationEmailWorker;
  repository: {
    findById: ReturnType<typeof vi.fn>;
    findPreviewContext: ReturnType<typeof vi.fn>;
    setTokenHash: ReturnType<typeof vi.fn>;
    touchSent: ReturnType<typeof vi.fn>;
  };
  tokenService: {
    generate: ReturnType<typeof vi.fn>;
    hash: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
  };
  sender: { send: ReturnType<typeof vi.fn> };
  logger: Logger;
  logCalls: { error: unknown[][] };
};

function makeHarness(invite: InvitationRecord | null = makeInvite()): Harness {
  const repository = {
    findById: vi.fn().mockResolvedValue(invite),
    findPreviewContext: vi.fn().mockResolvedValue({
      tenantName: "Acme Corp",
      tenantIsActive: true,
      inviterName: "Bob",
    }),
    setTokenHash: vi.fn().mockResolvedValue(undefined),
    touchSent: vi.fn().mockResolvedValue(undefined),
  };
  const tokenService = {
    generate: vi.fn(() => "raw-token-1"),
    hash: vi.fn((raw: string) => `hash-${raw}`),
    verify: vi.fn(),
  };
  const sender = { send: vi.fn().mockResolvedValue(undefined) };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;

  const deps: InvitationEmailWorkerDeps = {
    repository: repository as never,
    tokenService,
    sender,
    logger,
    frontendUrl: "https://app.example.com/",
  };

  return {
    worker: new InvitationEmailWorker(deps),
    repository,
    tokenService,
    sender,
    logger,
    logCalls: { error: vi.mocked(logger.error).mock.calls },
  };
}

describe("InvitationEmailWorker", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  it("generates a token, persists only its hash, sends the link and marks sent", async () => {
    await h.worker.process(makeJob());

    expect(h.tokenService.generate).toHaveBeenCalledOnce();
    expect(h.repository.setTokenHash).toHaveBeenCalledWith("invite-1", "hash-raw-token-1");
    expect(h.sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        acceptUrl: "https://app.example.com/accept-invite?token=raw-token-1",
      }),
    );
    expect(h.repository.touchSent).toHaveBeenCalledWith("invite-1");
  });

  it("never includes the raw token or full email in any log context", async () => {
    await h.worker.process(makeJob());

    const allCalls = [
      ...vi.mocked(h.logger.info).mock.calls,
      ...vi.mocked(h.logger.warn).mock.calls,
      ...vi.mocked(h.logger.error).mock.calls,
      ...vi.mocked(h.logger.debug).mock.calls,
    ];
    for (const [, context] of allCalls as Array<[string, Record<string, unknown>?]>) {
      const serialised = JSON.stringify(context ?? {});
      expect(serialised).not.toContain("raw-token-1");
      expect(serialised).not.toContain("alice@example.com");
    }
  });

  it("skips a revoked invitation without sending or rotating the token", async () => {
    const h2 = makeHarness(makeInvite({ status: "REVOKED" }));

    await h2.worker.process(makeJob());

    expect(h2.repository.setTokenHash).not.toHaveBeenCalled();
    expect(h2.sender.send).not.toHaveBeenCalled();
    expect(h2.repository.touchSent).not.toHaveBeenCalled();
  });

  it("skips an expired invitation", async () => {
    const h2 = makeHarness(makeInvite({ expiresAt: new Date(NOW.getTime() - 1) }));

    await h2.worker.process(makeJob());

    expect(h2.sender.send).not.toHaveBeenCalled();
  });

  it("skips an invitation that no longer exists", async () => {
    const h2 = makeHarness(null);

    await h2.worker.process(makeJob());

    expect(h2.sender.send).not.toHaveBeenCalled();
    expect(h2.repository.touchSent).not.toHaveBeenCalled();
  });

  it("rethrows a provider failure so Bull retries and does not mark sent", async () => {
    h.sender.send.mockRejectedValue(new Error("provider down"));

    await expect(h.worker.process(makeJob())).rejects.toThrow("provider down");
    expect(h.repository.touchSent).not.toHaveBeenCalled();
  });

  it("logs a dead-letter error on the final attempt without leaking the token", async () => {
    h.sender.send.mockRejectedValue(new Error("provider down"));

    await expect(
      h.worker.process(makeJob("invite-1", { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow("provider down");

    const errorJson = JSON.stringify(vi.mocked(h.logger.error).mock.calls);
    expect(errorJson).toContain("invitation.email.dead_letter");
    expect(errorJson).not.toContain("raw-token-1");
  });

  it("logs a retryable failure without dead-lettering before the last attempt", async () => {
    h.sender.send.mockRejectedValue(new Error("provider down"));

    await expect(
      h.worker.process(makeJob("invite-1", { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("provider down");

    const errorJson = JSON.stringify(vi.mocked(h.logger.error).mock.calls);
    expect(errorJson).toContain("invitation.email.send_failed");
    expect(errorJson).not.toContain("invitation.email.dead_letter");
  });
});
