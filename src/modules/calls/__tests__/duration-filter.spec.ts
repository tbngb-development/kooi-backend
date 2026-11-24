import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaCallRepository } from "../infrastructure/repositories/prisma-call.repository";
import prisma from "../../../shared/config/database/prisma";
import {
  exportCallsQuerySchema,
  listCallsQuerySchema,
} from "../presentation/call.schema";
import { ExportCallsUseCase } from "../application/use-cases/export-calls.use-case";
import type { CallRepository } from "../application/interfaces/call-repository.interface";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    call: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("call listing duration filter", () => {
  const tenantId = "tenant-duration-test";
  let repo: PrismaCallRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaCallRepository();
    repo.getTenantCallOverview = vi.fn().mockResolvedValue({
      totalCalls: 0,
      completedCalls: 0,
      failedCalls: 0,
      scheduledCalls: 0,
      busyCalls: 0,
      noAnswerCalls: 0,
      avgDurationSec: 0,
      totalCostPaisa: 0,
    });
    vi.mocked(prisma.call.findMany).mockResolvedValue([]);
    vi.mocked(prisma.call.count).mockResolvedValue(0);
  });

  it("filters calls longer than the custom duration", async () => {
    await repo.list(tenantId, {
      durationCondition: "gt",
      durationSeconds: 40,
    });

    expect(prisma.call.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          duration: { gt: 40 },
        }),
      }),
    );
  });

  it("filters calls shorter than the custom duration", async () => {
    await repo.list(tenantId, {
      durationCondition: "lt",
      durationSeconds: 30,
    });

    expect(prisma.call.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          duration: { lt: 30 },
        }),
      }),
    );
  });

  it("accepts paired duration query params as positive integers", () => {
    expect(
      listCallsQuerySchema.parse({
        durationCondition: "gt",
        durationSeconds: "40",
      }),
    ).toMatchObject({ durationCondition: "gt", durationSeconds: 40 });
    expect(
      exportCallsQuerySchema.parse({
        durationCondition: "lt",
        durationSeconds: "30",
      }),
    ).toMatchObject({ durationCondition: "lt", durationSeconds: 30 });
  });

  it("rejects incomplete or invalid duration query params", () => {
    expect(
      listCallsQuerySchema.safeParse({ durationCondition: "gt" }).success,
    ).toBe(false);
    expect(
      listCallsQuerySchema.safeParse({ durationSeconds: "40" }).success,
    ).toBe(false);
    expect(
      listCallsQuerySchema.safeParse({
        durationCondition: "gt",
        durationSeconds: "0",
      }).success,
    ).toBe(false);
    expect(
      exportCallsQuerySchema.safeParse({
        durationCondition: "between",
        durationSeconds: "40",
      }).success,
    ).toBe(false);
  });

  it("passes duration filters through the export use case", async () => {
    const findAllForExport = vi.fn().mockResolvedValue([]);
    const repo = { findAllForExport } as unknown as CallRepository;
    const useCase = new ExportCallsUseCase(repo);

    await useCase.execute({
      tenantId,
      durationCondition: "lt",
      durationSeconds: 30,
      timezone: "UTC",
    });

    expect(findAllForExport).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        durationCondition: "lt",
        durationSeconds: 30,
      }),
      expect.any(Number),
    );
  });
});
