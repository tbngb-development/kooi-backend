import axios, { type AxiosInstance, type AxiosError } from "axios";
import FormData from "form-data";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  ISarvamCohortClient,
  UploadSarvamCohortParams,
  GetSarvamCohortParams,
  SarvamCohortResponse,
} from "../../application/interfaces/sarvam-cohort-client.interface";

export class SarvamCohortClient implements ISarvamCohortClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly baseUrl: string = "https://apps.sarvam.ai",
    private readonly logger?: Logger,
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 60_000,
    });
  }

  async uploadCohort(
    params: UploadSarvamCohortParams,
  ): Promise<SarvamCohortResponse> {
    const {
      organizationId,
      workspaceId,
      campaignId,
      apiKey,
      name,
      cohortFile,
      cohortFileName,
      transformationJson,
      cohortCategory = "cohort",
    } = params;

    const url = `/api/scheduling/v1/orgs/${organizationId}/workspaces/${workspaceId}/campaigns/${campaignId}/cohorts/upload`;

    const form = new FormData();
    form.append("name", name.slice(0, 50));
    form.append("cohort_category", cohortCategory);
    form.append("cohort_file", cohortFile, {
      filename: cohortFileName || `${name}.csv`,
      contentType: "text/csv",
    });

    const transformationBuffer = Buffer.from(
      JSON.stringify(transformationJson),
      "utf-8",
    );
    form.append("cohort_transformation_file", transformationBuffer, {
      filename: "transformation.json",
      contentType: "application/json",
    });

    this.logger?.info("Uploading cohort to Sarvam AI", {
      action: "sarvam_cohort_client.upload",
      organizationId,
      workspaceId,
      campaignId,
      cohortName: name,
      cohortCategory,
      fileSizeBytes: cohortFile.length,
    });

    try {
      const response = await this.http.post<SarvamCohortResponse>(url, form, {
        headers: {
          "X-API-Key": apiKey,
          ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      this.logger?.info("Sarvam cohort uploaded successfully", {
        action: "sarvam_cohort_client.uploaded",
        cohortId: response.data.cohort_id,
        status: response.data.status,
      });

      return response.data;
    } catch (err) {
      this.handleError("Failed to upload cohort to Sarvam AI", err);
    }
  }

  async getCohort(
    params: GetSarvamCohortParams,
  ): Promise<SarvamCohortResponse> {
    const { organizationId, workspaceId, campaignId, cohortId, apiKey } =
      params;
    const url = `/api/scheduling/v1/orgs/${organizationId}/workspaces/${workspaceId}/campaigns/${campaignId}/cohorts/${cohortId}`;

    try {
      const response = await this.http.get<SarvamCohortResponse>(url, {
        headers: {
          "X-API-Key": apiKey,
        },
      });
      return response.data;
    } catch (err) {
      this.handleError("Failed to fetch cohort from Sarvam AI", err);
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

    this.logger?.error("Sarvam Cohort API request failure", axiosError, {
      action: "sarvam_cohort_client.error",
      statusCode,
      detail,
    });

    throw new AppError(
      statusCode === 422 ? HttpStatus.UNPROCESSABLE_ENTITY : statusCode,
      message,
      "SARVAM_COHORT_API_ERROR",
    );
  }
}

