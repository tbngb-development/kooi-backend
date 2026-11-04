import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { SarvamCohortClient } from "../infrastructure/clients/sarvam-cohort.client";
import { AppError } from "../../../shared/errors/app.error";

vi.mock("axios");

describe("SarvamCohortClient", () => {
  let client: SarvamCohortClient;
  const mockPost = vi.fn();
  const mockGet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue({
      post: mockPost,
      get: mockGet,
    } as any);

    client = new SarvamCohortClient("https://apps.sarvam.ai");
  });

  it("uploads a cohort successfully with multipart payload and headers", async () => {
    const mockResponse = {
      data: {
        name: "April Cohort",
        cohort_id: "coh-12345",
        status: "processing",
        source_type: "file_upload",
        cohort_category: "cohort",
        created_by: "system@kooi.io",
        created_at: "2026-04-01T09:00:00Z",
        updated_at: "2026-04-01T09:00:00Z",
        result: {
          total_records: 100,
          valid_records: 98,
          rejected_records: 2,
        },
      },
    };
    mockPost.mockResolvedValueOnce(mockResponse);

    const result = await client.uploadCohort({
      organizationId: "org-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      apiKey: "test-api-key",
      name: "April Cohort",
      cohortFile: Buffer.from("contact_number\n+919876543210"),
      cohortFileName: "april_cohort.csv",
      transformationJson: {
        phone_number: { column_name: "contact_number", required: true },
      },
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, formData, config] = mockPost.mock.calls[0];

    expect(url).toBe(
      "/api/scheduling/v1/orgs/org-1/workspaces/ws-1/campaigns/camp-1/cohorts/upload",
    );
    expect(config.headers["X-API-Key"]).toBe("test-api-key");
    expect(config.headers["content-type"]).toContain("multipart/form-data");
    expect(result.cohort_id).toBe("coh-12345");
    expect(result.status).toBe("processing");
  });

  it("fetches cohort details with getCohort", async () => {
    const mockResponse = {
      data: {
        name: "April Cohort",
        cohort_id: "coh-12345",
        status: "completed",
        source_type: "file_upload",
        cohort_category: "cohort",
        created_by: "system@kooi.io",
        created_at: "2026-04-01T09:00:00Z",
        updated_at: "2026-04-01T09:05:00Z",
        result: {
          total_records: 100,
          valid_records: 98,
          rejected_records: 2,
        },
      },
    };
    mockGet.mockResolvedValueOnce(mockResponse);

    const result = await client.getCohort({
      organizationId: "org-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      cohortId: "coh-12345",
      apiKey: "test-api-key",
    });

    expect(mockGet).toHaveBeenCalledWith(
      "/api/scheduling/v1/orgs/org-1/workspaces/ws-1/campaigns/camp-1/cohorts/coh-12345",
      {
        headers: {
          "X-API-Key": "test-api-key",
        },
      },
    );
    expect(result.status).toBe("completed");
    expect(result.result?.valid_records).toBe(98);
  });

  it("handles 422 error and unwraps error message", async () => {
    const errorResponse = {
      response: {
        status: 422,
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing cohort_transformation_file",
          },
        },
      },
    };
    mockPost.mockRejectedValueOnce(errorResponse);

    await expect(
      client.uploadCohort({
        organizationId: "org-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        apiKey: "test-api-key",
        name: "Invalid Cohort",
        cohortFile: Buffer.from("invalid"),
        cohortFileName: "invalid.csv",
        transformationJson: {},
      }),
    ).rejects.toThrow(AppError);
  });
});
