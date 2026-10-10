// modules/calls/application/use-cases/sync-bolna-execution.use-case.ts

import prisma from "../../../../shared/config/database/prisma";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { ProcessCallWebhookUseCase } from "../../../webhooks/application/use-cases/process-call-webhook.use-case";
import type { WebhookCallPayload } from "../../../webhooks/application/dto/webhook.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export interface SyncBolnaExecutionInput {
  callId?: string;
  bolnaExecutionId?: string;
  tenantId?: string;
}

export interface SyncBolnaExecutionOutput {
  success: boolean;
  message: string;
  call: unknown;
  execution: unknown;
}

export class SyncBolnaExecutionUseCase {
  constructor(
    private readonly bolnaClientFactory: IBolnaClientFactory,
    private readonly processCallWebhook: ProcessCallWebhookUseCase,
    private readonly logger?: Logger,
  ) {}

  async execute(input: SyncBolnaExecutionInput): Promise<SyncBolnaExecutionOutput> {
    let callRecord: { id: string; bolnaCallId: string | null; tenantId: string } | null = null;
    let resolvedBolnaId = input.bolnaExecutionId;
    let resolvedTenantId = input.tenantId;

    // 1. Try to resolve existing call from database if callId is provided
    if (input.callId) {
      callRecord = await prisma.call.findFirst({
        where: {
          OR: [
            { id: input.callId },
            { bolnaCallId: input.callId },
          ],
        },
        select: { id: true, bolnaCallId: true, tenantId: true },
      });

      if (callRecord) {
        resolvedBolnaId = resolvedBolnaId ?? callRecord.bolnaCallId ?? undefined;
        resolvedTenantId = resolvedTenantId ?? callRecord.tenantId;
      }
    }

    // 2. If call was not found by callId, try finding by bolnaExecutionId
    if (!callRecord && resolvedBolnaId) {
      callRecord = await prisma.call.findUnique({
        where: { bolnaCallId: resolvedBolnaId },
        select: { id: true, bolnaCallId: true, tenantId: true },
      });

      if (callRecord) {
        resolvedTenantId = resolvedTenantId ?? callRecord.tenantId;
      }
    }

    if (!resolvedBolnaId) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Bolna execution ID could not be determined. Please provide a bolnaExecutionId or a callId linked to Bolna.",
        "MISSING_BOLNA_EXECUTION_ID",
      );
    }

    this.logger?.info("Syncing call from Bolna execution", {
      action: "admin.call.sync_bolna",
      bolnaExecutionId: resolvedBolnaId,
      callId: callRecord?.id,
      tenantId: resolvedTenantId,
    });

    // 3. Resolve Bolna client (tenant-specific key with platform default fallback)
    const bolnaClient = await this.bolnaClientFactory.forTenant(resolvedTenantId ?? "");

    // 4. Fetch execution details from Bolna
    const execution = await bolnaClient.executions.get(resolvedBolnaId);
    if (!execution || !execution.id) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        `Bolna execution "${resolvedBolnaId}" not found on provider.`,
        "BOLNA_EXECUTION_NOT_FOUND",
      );
    }

    // 5. Map Bolna execution to normalized WebhookCallPayload
    const webhookPayload: WebhookCallPayload = {
      id: execution.id,
      execution_id: execution.id,
      agent_id: execution.agent_id,
      batch_id: execution.batch_id,
      status: execution.status,
      transcript: execution.transcript ?? null,
      summary: execution.summary ?? null,
      conversation_duration: execution.conversation_duration,
      total_cost: execution.total_cost,
      error_message: execution.error_message ?? null,
      extracted_data: execution.extracted_data ?? null,
      telephony_data: execution.telephony_data
        ? {
            duration: execution.telephony_data.duration,
            recording_url: execution.telephony_data.recording_url ?? "",
            to_number:
              execution.telephony_data.to_number ??
              (execution as any).user_number ??
              "",
            from_number:
              execution.telephony_data.from_number ??
              (execution as any).agent_number ??
              "",
            hangup_reason: (execution.telephony_data as any).hangup_reason ?? null,
          }
        : undefined,
      recording_url: execution.telephony_data?.recording_url,
      duration: execution.conversation_duration,
      batch_run_details: execution.batch_run_details
        ? { retried: execution.batch_run_details.retried }
        : undefined,
    };

    // 6. Execute full webhook lifecycle pipeline
    await this.processCallWebhook.execute(webhookPayload);

    // 7. Fetch refreshed call record with full relations
    const updatedCall = await prisma.call.findFirst({
      where: {
        OR: [
          { bolnaCallId: execution.id },
          ...(callRecord ? [{ id: callRecord.id }] : []),
        ],
      },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            stoppedReason: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        batch: {
          select: {
            id: true,
            status: true,
          },
        },
        callAnalysis: true,
        extractionOverview: true,
        extractionInsights: true,
        classifierResult: true,
      },
    });

    return {
      success: true,
      message: `Call successfully reconciled with Bolna (status: ${execution.status}).`,
      call: updatedCall,
      execution,
    };
  }
}
