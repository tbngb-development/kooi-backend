import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assistant: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  call: { groupBy: vi.fn() },
  campaign: { groupBy: vi.fn() },
}));

vi.mock("../../../shared/config/database/prisma", () => ({
  default: prismaMock,
}));

import { PrismaAssistantRepository } from "../infrastructure/repositories/prisma-assistant.repository";

const ALLOWED_HOURS = { start: "09:00", end: "21:00", tz: "Asia/Kolkata" };

const assistantRow = {
  id: "assistant-1",
  name: "Assistant",
  tenantId: "tenant-1",
  platformAgentId: "agent-1",
  config: {},
  variables: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  isDeleted: false,
  deletedAt: null,
  phoneNumbers: [],
  platformAgent: {
    id: "agent-1",
    bolnaId: "bolna-1",
    name: "Agent",
    slug: "agent",
    category: null,
    type: "OUTBOUND",
    gender: null,
    isActive: true,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    industryPack: {
      id: "pack-1",
      name: "Real Estate",
      slug: "real-estate",
      icon: null,
      allowedCallingHours: ALLOWED_HOURS,
    },
  },
};

describe("assistant industry calling hours exposure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.call.groupBy.mockResolvedValue([]);
    prismaMock.campaign.groupBy.mockResolvedValue([]);
  });

  it("includes allowedCallingHours in the assistant list", async () => {
    prismaMock.assistant.findMany.mockResolvedValue([assistantRow]);

    const repo = new PrismaAssistantRepository();
    const [assistant] = await repo.list("tenant-1");

    expect(assistant.platformAgent?.industryPack?.allowedCallingHours).toEqual(
      ALLOWED_HOURS,
    );
  });

  it("includes allowedCallingHours in the assistant detail", async () => {
    prismaMock.assistant.findFirst.mockResolvedValue(assistantRow);

    const repo = new PrismaAssistantRepository();
    const assistant = await repo.findByIdWithPlatformAgent(
      "tenant-1",
      "assistant-1",
    );

    expect(assistant?.platformAgent?.industryPack?.allowedCallingHours).toEqual(
      ALLOWED_HOURS,
    );
  });
});
