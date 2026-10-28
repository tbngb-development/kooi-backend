import prisma from "../../../../shared/config/database/prisma";
import type { Prisma } from "@prisma/client";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import {
  CallNotFoundError,
  CallCannotBeStoppedError,
} from "../../domain/errors/call.errors";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface StopCallInput {
  tenantId: string;
  callId: string;
}

export interface StopCallOutput {
  success: boolean;
  message: string;
  callId: string;
  status: string;
}

export class StopCallUseCase {
  constructor(
    private readonly bolnaClientFactory: IBolnaClientFactory,
    private readonly logger?: Logger,
  ) {}

  async execute(input: StopCallInput): Promise<StopCallOutput> {
    this.logger?.info("Request to stop call received", {
      action: "calls.stop.start",
      tenantId: input.tenantId,
      callId: input.callId,
    });

    const call = await prisma.call.findFirst({
      where: {
        OR: [{ id: input.callId }, { bolnaCallId: input.callId }],
        tenantId: input.tenantId,
        isDeleted: false,
      },
      include: {
        lead: true,
      },
    });

    if (!call) {
      throw new CallNotFoundError();
    }

    const stoppableStatuses = ["PENDING", "SCHEDULED"];
    if (!stoppableStatuses.includes(call.status)) {
      throw new CallCannotBeStoppedError(call.status);
    }

    // 1. Send stop call signal to Bolna if bolnaCallId exists
    if (call.bolnaCallId) {
      try {
        const bolnaClient = await this.bolnaClientFactory.forTenant(
          input.tenantId,
        );
        await bolnaClient.calls.stop(call.bolnaCallId);
        this.logger?.info("Bolna stop API called successfully", {
          action: "calls.stop.bolna_success",
          callId: call.id,
          bolnaCallId: call.bolnaCallId,
        });
      } catch (err: unknown) {
        this.logger?.warn(
          "Bolna stop call request returned non-critical error (call may have already concluded)",
          {
            action: "calls.stop.bolna_warning",
            callId: call.id,
            bolnaCallId: call.bolnaCallId,
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
    }

    // 2. Transition local Call and Lead states to STOPPED
    const historyList: CallHistoryItem[] = Array.isArray(call.callHistory)
      ? [...((call.callHistory as unknown) as CallHistoryItem[])]
      : [];

    historyList.push({
      attempt: historyList.length + 1,
      bolnaCallId: call.bolnaCallId ?? "unknown",
      status: "STOPPED",
      duration: call.duration ?? 0,
      cost: call.cost ?? 0,
      timestamp: new Date().toISOString(),
      errorMessage: "Manually stopped by user",
      hangupReason: "user_stopped",
    });

    const updatedCall = await prisma.call.update({
      where: { id: call.id },
      data: {
        status: "STOPPED",
        endedAt: new Date(),
        callHistory: (historyList as unknown) as Prisma.InputJsonValue,
      },
    });

    await prisma.lead.update({
      where: { id: call.leadId },
      data: {
        status: "STOPPED",
        stoppedReason: "MANUAL",
      },
    });

    this.logger?.info("Call and Lead transitioned to STOPPED", {
      action: "calls.stop.complete",
      callId: updatedCall.id,
      leadId: call.leadId,
      tenantId: input.tenantId,
    });

    return {
      success: true,
      message: "Call stopped successfully",
      callId: updatedCall.id,
      status: "STOPPED",
    };
  }
}
