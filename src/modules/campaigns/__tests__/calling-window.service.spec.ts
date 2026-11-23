import { describe, expect, it, vi } from "vitest";
import { CallingWindowService } from "../application/services/calling-window.service";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";

describe("CallingWindowService", () => {
  const campaign = {
    id: "camp-1",
    tenantId: "tenant-1",
    provider: "BOLNA",
    allowedSchedule: null,
  };

  it("prefers the campaign override", async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({
        ...campaign,
        allowedSchedule: {
          allowed_start_time: "09:00",
          allowed_end_time: "21:00",
          timezone: "Asia/Kolkata",
        },
      }),
      getCallingWindowContext: vi.fn().mockResolvedValue({
        industryCallingHours: { start: "10:00", end: "18:00", tz: "Asia/Kolkata" },
        sarvamSchedule: null,
      }),
    } as unknown as CampaignRepository;

    const window = await new CallingWindowService(repo).resolveWindow(
      "tenant-1",
      "camp-1",
    );

    expect(window).toMatchObject({
      startTime: "09:00",
      endTime: "21:00",
      source: "campaign",
    });
  });

  it("falls back to the industry pack for assistant campaigns", async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue(campaign),
      getCallingWindowContext: vi.fn().mockResolvedValue({
        industryCallingHours: { start: "10:00", end: "18:00", tz: "Asia/Kolkata" },
        sarvamSchedule: null,
      }),
    } as unknown as CampaignRepository;

    const window = await new CallingWindowService(repo).resolveWindow(
      "tenant-1",
      "camp-1",
    );

    expect(window).toMatchObject({
      startTime: "10:00",
      endTime: "18:00",
      source: "industry-pack",
    });
  });

  it("falls back to the Sarvam agent schedule for Sarvam campaigns", async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({ ...campaign, provider: "SARVAM" }),
      getCallingWindowContext: vi.fn().mockResolvedValue({
        industryCallingHours: null,
        sarvamSchedule: {
          allowed_start_time: "10:00",
          allowed_end_time: "20:00",
          timezone: "Asia/Kolkata",
        },
      }),
    } as unknown as CampaignRepository;

    const window = await new CallingWindowService(repo).resolveWindow(
      "tenant-1",
      "camp-1",
    );

    expect(window).toMatchObject({
      startTime: "10:00",
      endTime: "20:00",
      source: "sarvam-agent",
    });
  });
});
