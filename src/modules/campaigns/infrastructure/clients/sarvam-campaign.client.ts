import axios, { type AxiosInstance, type AxiosError } from "axios";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  SarvamConnectionConfig,
  SarvamRetryConfig,
} from "../../../sarvam-agents/domain/types/sarvam-agent.types";

export interface SarvamAllowedSchedule {
  allowed_start_time: string;
  allowed_end_time: string;
  allowed_days: string[];
  timezone?: string;
}

export interface SarvamCampaignAppConfig {
  app_id: string;
  app_type?: "agent";
  app_version: number;
  attempts_per_second: number;
  connection_configs: SarvamConnectionConfig[];
  retry_config: SarvamRetryConfig;
  phone_rotation?: {
    agent: boolean;
  };
  webhook_config?: {
    url: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

export interface CreateSarvamCampaignPayload {
  name: string;
  description?: string | null;
  start_timestamp: string;
  end_timestamp: string;
  allowed_schedule: SarvamAllowedSchedule;
  app_config: SarvamCampaignAppConfig;
  webhook_config?: {
    url: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

export interface SarvamCampaignResponse {
  campaign_id: string;
  name: string;
  status: string;
  app_id: string;
  created_at: string;
  updated_at: string;
  description?: string | null;
  app_type?: string;
  app_version?: number;
  updated_by?: string | null;
}

export interface ISarvamCampaignClient {
  createCampaign(
    orgId: string,
    workspaceId: string,
    apiKey: string,
    payload: CreateSarvamCampaignPayload,
  ): Promise<SarvamCampaignResponse>;

  getCampaign(
    orgId: string,
    workspaceId: string,
    campaignId: string,
    apiKey: string,
  ): Promise<SarvamCampaignResponse>;

  updateCampaign(
    orgId: string,
    workspaceId: string,
    campaignId: string,
    apiKey: string,
    payload: Partial<CreateSarvamCampaignPayload>,
  ): Promise<SarvamCampaignResponse>;

  updateStatus(
    orgId: string,
    workspaceId: string,
    campaignId: string,
    apiKey: string,
    action: "pause" | "resume" | "cancel",
  ): Promise<SarvamCampaignResponse>;
}

export class SarvamCampaignClient implements ISarvamCampaignClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly baseUrl: string = "https://apps.sarvam.ai",
    private readonly logger?: Logger,
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
    });
  }

  async createCampaign(
    orgId: string,
    workspaceId: string,
    apiKey: string,
    payload: CreateSarvamCampaignPayload,
  ): Promise<SarvamCampaignResponse> {
    const url = `/api/scheduling/v1/orgs/${orgId}/workspaces/${workspaceId}/campaigns`;

    this.logger?.info("Creating external Sarvam campaign", {
      action: "sarvam_client.create_campaign",
      orgId,
      workspaceId,
      campaignName: payload.name,
      appId: payload.app_config.app_id,
    });

    try {
      const response = await this.http.post<SarvamCampaignResponse>(
        url,
        payload,
        {
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      this.logger?.info("Sarvam campaign created successfully", {
        action: "sarvam_client.campaign_created",
        sarvamCampaignId: response.data.campaign_id,
        status: response.data.status,
      });

      return response.data;
    } catch (err) {
      this.handleError("Failed to create campaign at Sarvam AI", err);
    }
  }

  async getCampaign(
    orgId: string,
    workspaceId: string,
    campaignId: string,
    apiKey: string,
  ): Promise<SarvamCampaignResponse> {
    const url = `/api/scheduling/v1/orgs/${orgId}/workspaces/${workspaceId}/campaigns/${campaignId}`;

    try {
      const response = await this.http.get<SarvamCampaignResponse>(url, {
        headers: {
          "X-API-Key": apiKey,
        },
      });
      return response.data;
    } catch (err) {
      this.handleError("Failed to fetch campaign from Sarvam AI", err);
    }
  }

  async updateCampaign(
    orgId: string,
    workspaceId: string,
    campaignId: string,
    apiKey: string,
    payload: Partial<CreateSarvamCampaignPayload>,
  ): Promise<SarvamCampaignResponse> {
    const url = `/api/scheduling/v1/orgs/${orgId}/workspaces/${workspaceId}/campaigns/${campaignId}`;

    try {
      const response = await this.http.patch<SarvamCampaignResponse>(
        url,
        payload,
        {
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (err) {
      this.handleError("Failed to update campaign at Sarvam AI", err);
    }
  }

  async updateStatus(
    orgId: string,
    workspaceId: string,
    campaignId: string,
    apiKey: string,
    action: "pause" | "resume" | "cancel",
  ): Promise<SarvamCampaignResponse> {
    const url = `/api/scheduling/v1/orgs/${orgId}/workspaces/${workspaceId}/campaigns/${campaignId}/status`;

    try {
      const response = await this.http.put<SarvamCampaignResponse>(
        url,
        { action },
        {
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (err) {
      this.handleError(`Failed to ${action} campaign at Sarvam AI`, err);
    }
  }

  private handleError(contextMessage: string, err: unknown): never {
    const axiosError = err as AxiosError<{
      error?: { code?: string; message?: string };
      message?: string;
      detail?: string | Array<{ msg?: string }>;
    }>;

    const statusCode =
      axiosError.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const data = axiosError.response?.data;
    let detail = "";
    if (data?.error?.message) {
      detail = data.error.message;
    } else if (typeof data?.detail === "string") {
      detail = data.detail;
    } else if (Array.isArray(data?.detail) && data.detail.length > 0) {
      detail = data.detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ");
    } else if (data?.message) {
      detail = data.message;
    } else if (axiosError.message) {
      detail = axiosError.message;
    }

    const message = detail ? `${contextMessage}: ${detail}` : contextMessage;

    this.logger?.error("Sarvam API request failure", axiosError, {
      action: "sarvam_client.error",
      statusCode,
      detail,
    });

    throw new AppError(
      statusCode === 422 ? HttpStatus.UNPROCESSABLE_ENTITY : statusCode,
      message,
      "SARVAM_API_ERROR",
    );
  }
}
