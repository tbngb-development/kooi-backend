import type { RetryConfig } from "../../../shared/types/bolna.types";

export interface BolnaBatchCreateParams {
  agentId: string;
  csvBuffer: Buffer;
  fileName: string;
  retryConfig?: RetryConfig;
  webhookUrl?: string;
}

export interface BolnaBatchCreateResult {
  batchId: string;
}

export interface BolnaBatchScheduleResult {
  message: string;
  state: string;
}

import type {
  BolnaBatchResponse,
  BolnaBatchScheduleResponse,
  BolnaBatchStatus,
  BolnaExecution,
} from "../../../shared/types/bolna.types";
import type { CreateBatchParams } from "../../../shared/config/external/bolna/bolna.client";

export interface BolnaBatchProvider {
  createBatch(
    tenantId: string,
    params: CreateBatchParams,
  ): Promise<BolnaBatchResponse>;
  scheduleBatch(
    tenantId: string,
    bolnaBatchId: string,
    scheduledAt: string,
  ): Promise<BolnaBatchScheduleResponse>;
  stopBatch(
    tenantId: string,
    bolnaBatchId: string,
  ): Promise<{ message: string; state: "stopped" }>;
  getBatchStatus(
    tenantId: string,
    bolnaBatchId: string,
  ): Promise<BolnaBatchStatus>;
  getBatchExecutions(
    tenantId: string,
    bolnaBatchId: string,
  ): Promise<BolnaExecution[]>;
  deleteBatch(
    tenantId: string,
    bolnaBatchId: string,
  ): Promise<{ message: string; state: "deleted" }>;
}
