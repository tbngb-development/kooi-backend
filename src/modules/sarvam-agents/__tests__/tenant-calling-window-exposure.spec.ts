import type { SarvamAgent } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { SarvamAgentMapper } from "../application/mappers/sarvam-agent.mapper";

const agent = {
  id: "agent-1",
  name: "Sarvam Agent",
  appId: "app-1",
  appVersion: 1,
  attemptsPerSecond: null,
  gender: null,
  type: "OUTBOUND",
  audioUrl: null,
  audioRecordings: null,
  agentVariables: [],
  welcomeMessage: null,
  outputVariables: [],
  connectionConfigs: [],
  retryConfig: { max_retries: 0 },
  allowedSchedule: {
    allowed_start_time: "10:00",
    allowed_end_time: "20:00",
    allowed_days: ["Monday", "Tuesday"],
    timezone: "Asia/Kolkata",
  },
  allowTenantVisible: true,
  status: "ACTIVE",
  goals: [],
  createdBy: "admin-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as unknown as SarvamAgent;

describe("tenant Sarvam agent calling window exposure", () => {
  const mapper = new SarvamAgentMapper();

  it("exposes the parsed schedule in the tenant summary", () => {
    const dto = mapper.toTenantSummaryDTO(agent);

    expect(dto.allowedSchedule).toEqual({
      allowed_start_time: "10:00",
      allowed_end_time: "20:00",
      allowed_days: ["Monday", "Tuesday"],
      timezone: "Asia/Kolkata",
    });
  });

  it("exposes the parsed schedule in the tenant detail", () => {
    const dto = mapper.toTenantDetailDTO(agent);

    expect(dto.allowedSchedule).toEqual({
      allowed_start_time: "10:00",
      allowed_end_time: "20:00",
      allowed_days: ["Monday", "Tuesday"],
      timezone: "Asia/Kolkata",
    });
  });
});
