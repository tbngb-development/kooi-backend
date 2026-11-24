import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { SarvamCampaignClient } from "../infrastructure/clients/sarvam-campaign.client";
import type { CreateSarvamCampaignPayload } from "../infrastructure/clients/sarvam-campaign.client";

vi.mock("axios");

describe("SarvamCampaignClient", () => {
  let client: SarvamCampaignClient;
  let mockPost: any;
  let mockPatch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost = vi.fn().mockResolvedValue({
      data: {
        campaign_id: "ext-camp-123",
        status: "scheduled",
      },
    });
    mockPatch = vi.fn().mockResolvedValue({
      data: {
        campaign_id: "ext-camp-123",
        status: "scheduled",
      },
    });

    (axios.create as any).mockReturnValue({
      post: mockPost,
      patch: mockPatch,
    });

    client = new SarvamCampaignClient("https://apps.sarvam.ai");
  });

  const basePayload: CreateSarvamCampaignPayload = {
    name: "Test Campaign",
    start_timestamp: "2026-05-01T09:00:00.000Z",
    end_timestamp: "2026-05-15T18:00:00.000Z",
    allowed_schedule: {
      allowed_start_time: "09:30",
      allowed_end_time: "18:30",
      allowed_days: ["Monday"],
      timezone: "Asia/Kolkata",
    },
    app_config: {
      app_id: "app-1",
      app_version: 1,
      attempts_per_second: 1,
      connection_configs: [],
      retry_config: {
        max_retries: 0,
        retry_interval_minutes: null,
      } as any,
      webhook_config: { url: "https://kooi.ai/webhook" },
    },
  };

  it("sanitizes retry_config by stripping null retry_interval_minutes before creating campaign", async () => {
    await client.createCampaign("org-1", "ws-1", "key-123", basePayload);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const sentPayload = mockPost.mock.calls[0][1];
    expect(sentPayload.app_config.retry_config.max_retries).toBe(0);
    expect(sentPayload.app_config.retry_config).not.toHaveProperty("retry_interval_minutes");
  });

  it("preserves positive integer retry_interval_minutes when creating campaign", async () => {
    const payloadWithInterval: CreateSarvamCampaignPayload = {
      ...basePayload,
      app_config: {
        ...basePayload.app_config,
        retry_config: {
          max_retries: 3,
          retry_interval_minutes: 15,
        },
      },
    };

    await client.createCampaign("org-1", "ws-1", "key-123", payloadWithInterval);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const sentPayload = mockPost.mock.calls[0][1];
    expect(sentPayload.app_config.retry_config.retry_interval_minutes).toBe(15);
  });

  it("sanitizes retry_config before updating campaign", async () => {
    await client.updateCampaign("org-1", "ws-1", "camp-123", "key-123", {
      app_config: {
        retry_config: {
          max_retries: 0,
          retry_interval_minutes: null,
        } as any,
      } as any,
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);
    const sentPayload = mockPatch.mock.calls[0][1];
    expect(sentPayload.app_config.retry_config.max_retries).toBe(0);
    expect(sentPayload.app_config.retry_config).not.toHaveProperty("retry_interval_minutes");
  });
});

