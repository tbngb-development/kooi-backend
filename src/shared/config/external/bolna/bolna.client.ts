import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";
import { normalizePhoneNumber } from "../../../../modules/leads/domain/rules/phone.rules";
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

  constructor(apiKey: string, baseUrl: string) {
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
      const response = await this.http.post<BolnaCallResponse>("/call", {
        ...payload,
        recipient_phone_number: normalizedPhone,
      });
      return response.data;
    },
  };

  agents = {
    verify: async (agentId: string): Promise<BolnaAgentResponse> => {
      const response = await this.http.get<BolnaAgentResponse>(
        `/v2/agent/${agentId}`,
      );
      return response.data;
    },

    list: async (): Promise<BolnaAgentResponse[]> => {
      const response =
        await this.http.get<BolnaAgentResponse[]>("/v2/agent/all");
      return response.data;
    },
  };

  batches = {
    create: async (params: CreateBatchParams): Promise<BolnaBatchResponse> => {
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
      return response.data;
    },

    schedule: async (
      bolnaBatchId: string,
      scheduledAt: string,
    ): Promise<BolnaBatchScheduleResponse> => {
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
      return response.data;
    },

    stop: async (bolnaBatchId: string) => {
      const response = await this.http.post<{
        message: string;
        state: "stopped";
      }>(`/batches/${bolnaBatchId}/stop`);
      return response.data;
    },

    get: async (bolnaBatchId: string): Promise<BolnaBatchStatus> => {
      const response = await this.http.get<BolnaBatchStatus>(
        `/batches/${bolnaBatchId}`,
      );
      return response.data;
    },

    getExecutions: async (bolnaBatchId: string): Promise<BolnaExecution[]> => {
      const response = await this.http.get<BolnaExecution[]>(
        `/batches/${bolnaBatchId}/executions`,
      );
      return response.data;
    },

    delete: async (bolnaBatchId: string) => {
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
      const response = await this.http.get<BolnaExtractionCategoryListResponse>(
        `/agent/${agentId}/extraction-categories`,
      );
      return response.data;
    },

    createCategory: async (
      agentId: string,
      payload: BolnaCategoryCreatePayload,
    ): Promise<BolnaExtractionCategoryResponse> => {
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
      const response = await this.http.patch<BolnaExtractionCategoryResponse>(
        `/extraction-categories/${categoryId}`,
        payload,
      );
      return response.data;
    },

    deleteCategory: async (categoryId: string): Promise<void> => {
      await this.http.delete(`/extraction-categories/${categoryId}`);
    },

    listDispositions: async (
      agentId?: string,
    ): Promise<BolnaDispositionResponse[]> => {
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
      const response = await this.http.put<BolnaDispositionCreateResponse>(
        `/dispositions/${dispositionId}`,
        payload,
      );
      return response.data;
    },

    deleteDisposition: async (dispositionId: string): Promise<void> => {
      await this.http.delete(`/dispositions/${dispositionId}`);
    },
  };
}
