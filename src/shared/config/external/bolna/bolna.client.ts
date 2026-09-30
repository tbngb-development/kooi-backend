import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";
import { normalizePhoneNumber } from "../../../../modules/leads/domain/rules/phone.rules";
import type { Logger } from "../../../logging/logger.interface";
import type {
  BolnaAgentResponse,
  BolnaCallPayload,
  BolnaCallResponse,
  BolnaBatchResponse,
  BolnaBatchScheduleResponse,
  BolnaBatchStatus,
  BolnaExecution,
  RetryConfig,
  BolnaExtractionCategoryListResponse,
  BolnaCategoryCreatePayload,
  BolnaExtractionCategoryResponse,
  BolnaDispositionCreatePayload,
  BolnaDispositionResponse,
  BolnaDispositionCreateResponse,
} from "../../../types/bolna.types";

export interface CreateBatchParams {
  agentId: string;
  csvBuffer: Buffer;
  fileName: string;
  retryConfig?: RetryConfig;
  webhookUrl?: string;
  fromPhoneNumbers?: string[];
}

export interface IBolnaClient {
  calls: {
    create(payload: BolnaCallPayload): Promise<BolnaCallResponse>;
  };
  agents: {
    verify(agentId: string): Promise<BolnaAgentResponse>;
    list(): Promise<BolnaAgentResponse[]>;
  };
  batches: {
    create(params: CreateBatchParams): Promise<BolnaBatchResponse>;
    schedule(
      bolnaBatchId: string,
      scheduledAt: string,
    ): Promise<BolnaBatchScheduleResponse>;
    stop(bolnaBatchId: string): Promise<{ message: string; state: "stopped" }>;
    get(bolnaBatchId: string): Promise<BolnaBatchStatus>;
    getExecutions(bolnaBatchId: string): Promise<BolnaExecution[]>;
    delete(
      bolnaBatchId: string,
    ): Promise<{ message: string; state: "deleted" }>;
  };
  extractions: {
    listCategories(
      agentId: string,
    ): Promise<BolnaExtractionCategoryListResponse>;
    createCategory(
      agentId: string,
      payload: BolnaCategoryCreatePayload,
    ): Promise<BolnaExtractionCategoryResponse>;
    updateCategory(
      categoryId: string,
      payload: Partial<BolnaCategoryCreatePayload>,
    ): Promise<BolnaExtractionCategoryResponse>;
    deleteCategory(categoryId: string): Promise<void>;
    listDispositions(agentId?: string): Promise<BolnaDispositionResponse[]>;
    createDisposition(
      payload: BolnaDispositionCreatePayload,
    ): Promise<BolnaDispositionCreateResponse>;
    updateDisposition(
      dispositionId: string,
      payload: Partial<BolnaDispositionCreatePayload>,
    ): Promise<BolnaDispositionCreateResponse>;
    deleteDisposition(dispositionId: string): Promise<void>;
  };
}

export class BolnaClient implements IBolnaClient {
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl: string,
    private readonly logger?: Logger,
  ) {
    if (!apiKey) throw new Error("BolnaClient requires an API key.");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    });
  }

  calls = {
    create: async (payload: BolnaCallPayload): Promise<BolnaCallResponse> => {
      const normalizedPhone = normalizePhoneNumber(
        payload.recipient_phone_number,
      );
      this.logger?.debug("Making outbound Bolna call request", {
        action: "bolna.calls.create",
        agentId: payload.agent_id,
      });
      const response = await this.http.post<BolnaCallResponse>("/call", {
        ...payload,
        recipient_phone_number: normalizedPhone,
      });
      return response.data;
    },
  };

  agents = {
    verify: async (agentId: string): Promise<BolnaAgentResponse> => {
      this.logger?.debug("Verifying Bolna agent config", {
        action: "bolna.agents.verify",
        agentId,
      });
      const response = await this.http.get<BolnaAgentResponse>(
        `/v2/agent/${agentId}`,
      );
      return response.data;
    },

    list: async (): Promise<BolnaAgentResponse[]> => {
      this.logger?.debug("Listing all Bolna agents", {
        action: "bolna.agents.list",
      });
      const response =
        await this.http.get<BolnaAgentResponse[]>("/v2/agent/all");
      return response.data;
    },
  };

  batches = {
    create: async (params: CreateBatchParams): Promise<BolnaBatchResponse> => {
      this.logger?.debug("Sending batch to Bolna API", {
        action: "bolna.batches.create_start",
        agentId: params.agentId,
        fileName: params.fileName,
      });

      const form = new FormData();
      form.append("agent_id", params.agentId);
      form.append("file", params.csvBuffer, {
        filename: params.fileName,
        contentType: "text/csv",
      });

      if (params.webhookUrl) {
        form.append("webhook_url", params.webhookUrl);
      }

      if (params.fromPhoneNumbers?.length) {
        for (const phone of params.fromPhoneNumbers) {
          form.append("from_phone_numbers", normalizePhoneNumber(phone));
        }
      }

      if (params.retryConfig?.enabled) {
        form.append("retry_config", JSON.stringify(params.retryConfig));
      }

      const response = await axios.post<BolnaBatchResponse>(
        `${this.baseUrl}/batches`,
        form,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...form.getHeaders(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );

      this.logger?.info("Bolna batch created successfully", {
        action: "bolna.batches.create_success",
        agentId: params.agentId,
        bolnaBatchId: response.data.batch_id,
      });

      return response.data;
    },

    schedule: async (
      bolnaBatchId: string,
      scheduledAt: string,
    ): Promise<BolnaBatchScheduleResponse> => {
      this.logger?.debug("Scheduling Bolna batch", {
        action: "bolna.batches.schedule_start",
        bolnaBatchId,
        scheduledAt,
      });

      const form = new FormData();
      form.append("scheduled_at", scheduledAt);

      const response = await axios.post<BolnaBatchScheduleResponse>(
        `${this.baseUrl}/batches/${bolnaBatchId}/schedule`,
        form,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...form.getHeaders(),
          },
        },
      );

      this.logger?.info("Bolna batch scheduled successfully", {
        action: "bolna.batches.schedule_success",
        bolnaBatchId,
        scheduledAt,
      });

      return response.data;
    },

    stop: async (bolnaBatchId: string) => {
      this.logger?.debug("Stopping Bolna batch execution", {
        action: "bolna.batches.stop",
        bolnaBatchId,
      });
      const response = await this.http.post<{
        message: string;
        state: "stopped";
      }>(`/batches/${bolnaBatchId}/stop`);
      return response.data;
    },

    get: async (bolnaBatchId: string): Promise<BolnaBatchStatus> => {
      this.logger?.debug("Fetching Bolna batch status", {
        action: "bolna.batches.get",
        bolnaBatchId,
      });
      const response = await this.http.get<BolnaBatchStatus>(
        `/batches/${bolnaBatchId}`,
      );
      return response.data;
    },

    getExecutions: async (bolnaBatchId: string): Promise<BolnaExecution[]> => {
      this.logger?.debug("Fetching Bolna batch executions", {
        action: "bolna.batches.get_executions",
        bolnaBatchId,
      });
      const response = await this.http.get<BolnaExecution[]>(
        `/batches/${bolnaBatchId}/executions`,
      );
      return response.data;
    },

    delete: async (bolnaBatchId: string) => {
      this.logger?.debug("Deleting Bolna batch reference", {
        action: "bolna.batches.delete",
        bolnaBatchId,
      });
      const response = await this.http.delete<{
        message: string;
        state: "deleted";
      }>(`/batches/${bolnaBatchId}`);
      return response.data;
    },
  };

  extractions = {
    listCategories: async (
      agentId: string,
    ): Promise<BolnaExtractionCategoryListResponse> => {
      this.logger?.debug("Listing Bolna agent extraction categories", {
        action: "bolna.extractions.list_categories",
        agentId,
      });
      const response = await this.http.get<BolnaExtractionCategoryListResponse>(
        `/agent/${agentId}/extraction-categories`,
      );
      return response.data;
    },

    createCategory: async (
      agentId: string,
      payload: BolnaCategoryCreatePayload,
    ): Promise<BolnaExtractionCategoryResponse> => {
      this.logger?.debug("Creating Bolna extraction category", {
        action: "bolna.extractions.create_category",
        agentId,
        categoryName: payload.name,
      });
      const response = await this.http.post<BolnaExtractionCategoryResponse>(
        `/agent/${agentId}/extraction-categories`,
        payload,
      );
      return response.data;
    },

    updateCategory: async (
      categoryId: string,
      payload: Partial<BolnaCategoryCreatePayload>,
    ): Promise<BolnaExtractionCategoryResponse> => {
      this.logger?.debug("Updating Bolna extraction category", {
        action: "bolna.extractions.update_category",
        categoryId,
      });
      const response = await this.http.patch<BolnaExtractionCategoryResponse>(
        `/extraction-categories/${categoryId}`,
        payload,
      );
      return response.data;
    },

    deleteCategory: async (categoryId: string): Promise<void> => {
      this.logger?.debug("Deleting Bolna extraction category", {
        action: "bolna.extractions.delete_category",
        categoryId,
      });
      await this.http.delete(`/extraction-categories/${categoryId}`);
    },

    listDispositions: async (
      agentId?: string,
    ): Promise<BolnaDispositionResponse[]> => {
      this.logger?.debug("Listing Bolna dispositions", {
        action: "bolna.extractions.list_dispositions",
        agentId,
      });
      const params = agentId ? { agent_id: agentId } : {};
      const response = await this.http.get<BolnaDispositionResponse[]>(
        "/dispositions/",
        { params },
      );
      return response.data;
    },

    createDisposition: async (
      payload: BolnaDispositionCreatePayload,
    ): Promise<BolnaDispositionCreateResponse> => {
      this.logger?.debug("Creating Bolna disposition key", {
        action: "bolna.extractions.create_disposition",
        dispositionName: payload.name,
      });
      const response = await this.http.post<BolnaDispositionCreateResponse>(
        "/dispositions/",
        payload,
      );
      return response.data;
    },

    updateDisposition: async (
      dispositionId: string,
      payload: Partial<BolnaDispositionCreatePayload>,
    ): Promise<BolnaDispositionCreateResponse> => {
      this.logger?.debug("Updating Bolna disposition", {
        action: "bolna.extractions.update_disposition",
        dispositionId,
      });
      const response = await this.http.put<BolnaDispositionCreateResponse>(
        `/dispositions/${dispositionId}`,
        payload,
      );
      return response.data;
    },

    deleteDisposition: async (dispositionId: string): Promise<void> => {
      this.logger?.debug("Deleting Bolna disposition", {
        action: "bolna.extractions.delete_disposition",
        dispositionId,
      });
      await this.http.delete(`/dispositions/${dispositionId}`);
    },
  };
}
