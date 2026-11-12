import prismaClient from "../../../../shared/config/database/prisma";
import type { PrismaClient } from "@prisma/client";
import type { ISarvamRecordingClient } from "../interfaces/sarvam-recording-client.interface";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { FileStorageProvider } from "../../../../shared/config/external/storage/file-storage.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { CallNotFoundError } from "../../domain/errors/call.errors";
import {
  SarvamRecordingIneligibleError,
  SarvamRecordingPermanentError,
  type RecordingRetrievalStatus,
} from "../../domain/errors/sarvam-recording.errors";
import type { SarvamAttemptHistoryEntry } from "../../../webhooks/application/interfaces/sarvam-webhook-repository.interface";

export interface FetchSarvamRecordingInput {
  callId: string;
  tenantId?: string;
  attemptId?: string;
  interactionId?: string;
  source: "AUTOMATIC" | "MANUAL";
  adminUserId?: string;
}

export interface FetchSarvamRecordingOutput {
  success: boolean;
  message: string;
  recordingUrl: string;
  status: RecordingRetrievalStatus;
  attemptId: string;
  interactionId: string;
}

export class FetchSarvamRecordingUseCase {
  constructor(
    private readonly recordingClient: ISarvamRecordingClient,
    private readonly encryptionService: ISarvamApiKeyEncryptionService,
    private readonly storage: FileStorageProvider,
    private readonly prisma: PrismaClient = prismaClient,
    private readonly logger?: Logger,
  ) {}

  async execute(
    input: FetchSarvamRecordingInput,
  ): Promise<FetchSarvamRecordingOutput> {
    const { callId, tenantId, attemptId, interactionId, source, adminUserId } =
      input;

    this.logger?.debug("Starting Sarvam call recording retrieval", {
      action: "sarvam_recording.fetch_start",
      callId,
      tenantId,
      attemptId,
      interactionId,
      source,
    });

    // 1. Fetch Call & verify provider
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        campaign: {
          select: {
            id: true,
            sarvamAgentId: true,
          },
        },
      },
    });

    if (!call) {
      throw new CallNotFoundError();
    }

    if (tenantId && call.tenantId !== tenantId) {
      throw new CallNotFoundError();
    }

    if (call.provider !== "SARVAM") {
      throw new SarvamRecordingIneligibleError(
        `Call '${callId}' provider is '${call.provider ?? "UNKNOWN"}'. Recording retrieval is only available for SARVAM calls.`,
      );
    }

    // 2. Identify the target attempt from callHistory
    const rawHistory = Array.isArray(call.callHistory)
      ? (call.callHistory as unknown as SarvamAttemptHistoryEntry[])
      : [];

    let targetIndex = -1;

    if (attemptId) {
      targetIndex = rawHistory.findIndex((a) => a.attempt_id === attemptId);
    } else if (interactionId) {
      targetIndex = rawHistory.findIndex(
        (a) => a.interaction_id === interactionId,
      );
    } else {
      // Latest attempt that has an interaction_id
      for (let i = rawHistory.length - 1; i >= 0; i--) {
        if (rawHistory[i].interaction_id) {
          targetIndex = i;
          break;
        }
      }
    }

    let targetAttempt: SarvamAttemptHistoryEntry;

    if (targetIndex >= 0) {
      targetAttempt = { ...rawHistory[targetIndex] };
    } else if (call.sarvamInteractionId) {
      // Synthesize fallback attempt if call has interactionId recorded directly
      targetAttempt = {
        attempt_id: call.sarvamAttemptId ?? "attempt-1",
        interaction_id: call.sarvamInteractionId,
        user_identifier: call.sarvamUserIdentifier ?? "unknown",
        retry_attempt: 0,
        completion_status: "completed",
        timestamp: call.startedAt?.toISOString() ?? new Date().toISOString(),
        status: call.status,
      };
      rawHistory.push(targetAttempt);
      targetIndex = rawHistory.length - 1;
    } else {
      throw new SarvamRecordingIneligibleError(
        `No valid Sarvam interaction ID found for call '${callId}'.`,
      );
    }

    const resolvedInteractionId = targetAttempt.interaction_id;
    if (!resolvedInteractionId) {
      throw new SarvamRecordingIneligibleError(
        `Selected attempt '${targetAttempt.attempt_id}' has no interaction ID.`,
      );
    }

    // 3. Idempotency Check: already stored?
    if (
      targetAttempt.recording_status === "AVAILABLE" &&
      targetAttempt.recording_url
    ) {
      this.logger?.info("Sarvam recording is already stored, skipping download", {
        action: "sarvam_recording.already_available",
        callId,
        interactionId: resolvedInteractionId,
        recordingUrl: targetAttempt.recording_url,
      });

      if (source === "MANUAL") {
        this.logger?.info(
          "[Audit] Platform Administrator retrieved existing Sarvam call recording",
          {
            action: "SARVAM_RECORDING_MANUAL_REFETCH",
            callId: call.id,
            tenantId: call.tenantId,
            interactionId: resolvedInteractionId,
            attemptId: targetAttempt.attempt_id,
            adminUserId,
            outcome: "ALREADY_AVAILABLE",
            timestamp: new Date().toISOString(),
          },
        );
      }

      return {
        success: true,
        message: "Sarvam recording is already available",
        recordingUrl: targetAttempt.recording_url,
        status: "AVAILABLE",
        attemptId: targetAttempt.attempt_id,
        interactionId: resolvedInteractionId,
      };
    }

    // 4. Resolve Tenant Sarvam credentials
    const apiKeyRecord = await this.prisma.sarvamApiKey.findUnique({
      where: { tenantId: call.tenantId },
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      throw new SarvamRecordingPermanentError(
        401,
        `Tenant '${call.tenantId}' does not have an active Sarvam API key configured.`,
        "SARVAM_API_KEY_NOT_FOUND",
      );
    }

    const decryptedApiKey = this.encryptionService.decrypt(
      apiKeyRecord.apiKeyEncrypted,
    );
    const organizationId = apiKeyRecord.organizationId;
    const workspaceId = apiKeyRecord.workspaceId;

    // 5. Resolve Sarvam Agent appId
    const agentId = call.sarvamAgentId ?? call.campaign?.sarvamAgentId;
    if (!agentId) {
      throw new SarvamRecordingPermanentError(
        404,
        `Call '${callId}' has no associated Sarvam Agent configured.`,
        "SARVAM_AGENT_NOT_FOUND",
      );
    }

    const agent = await this.prisma.sarvamAgent.findUnique({
      where: { id: agentId },
      select: { id: true, appId: true },
    });

    if (!agent || !agent.appId) {
      throw new SarvamRecordingPermanentError(
        404,
        `Sarvam agent record '${agentId}' not found or lacks appId.`,
        "SARVAM_AGENT_NOT_FOUND",
      );
    }

    const appId = agent.appId;

    // 6. Download WAV from Sarvam & Upload to Cloud Storage
    try {
      const wavBuffer = await this.recordingClient.downloadRecordingWav({
        organizationId,
        workspaceId,
        appId,
        interactionId: resolvedInteractionId,
        apiKey: decryptedApiKey,
      });

      const sanitizedInteractionId = resolvedInteractionId.replace(
        /[/\\?%*:|"<>]/g,
        "_",
      );
      const fileName = `${sanitizedInteractionId}.wav`;
      const folder = `kooi/recordings/sarvam/${call.tenantId}`;

      const recordingUrl = await this.storage.uploadBuffer(
        wavBuffer,
        fileName,
        folder,
        { resourceType: "video" },
      );

      // 7. Update attempt & Call atomically
      targetAttempt.recording_url = recordingUrl;
      targetAttempt.recording_status = "AVAILABLE";
      targetAttempt.recording_error = null;
      targetAttempt.recording_attempts =
        (targetAttempt.recording_attempts ?? 0) + 1;
      targetAttempt.recording_retrieved_at = new Date().toISOString();
      targetAttempt.recording_source = source;

      rawHistory[targetIndex] = targetAttempt;

      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          callHistory: rawHistory as any,
          recording: recordingUrl,
        },
      });

      if (source === "MANUAL") {
        this.logger?.info(
          "[Audit] Platform Administrator successfully retrieved Sarvam call recording",
          {
            action: "SARVAM_RECORDING_MANUAL_REFETCH",
            callId: call.id,
            tenantId: call.tenantId,
            interactionId: resolvedInteractionId,
            attemptId: targetAttempt.attempt_id,
            adminUserId,
            outcome: "SUCCESS",
            timestamp: new Date().toISOString(),
          },
        );
      }

      return {
        success: true,
        message: "Sarvam recording retrieved successfully",
        recordingUrl,
        status: "AVAILABLE",
        attemptId: targetAttempt.attempt_id,
        interactionId: resolvedInteractionId,
      };
    } catch (err: unknown) {
      const isPermanent = err instanceof SarvamRecordingPermanentError;
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Track failed attempt in DB
      targetAttempt.recording_status = isPermanent ? "FAILED" : "PENDING";
      targetAttempt.recording_error = errorMessage;
      targetAttempt.recording_attempts =
        (targetAttempt.recording_attempts ?? 0) + 1;
      targetAttempt.recording_source = source;

      rawHistory[targetIndex] = targetAttempt;

      await this.prisma.call
        .update({
          where: { id: call.id },
          data: {
            callHistory: rawHistory as any,
          },
        })
        .catch((dbErr) => {
          this.logger?.error(
            "Failed to persist recording attempt error state to database",
            dbErr,
            { callId: call.id },
          );
        });

      if (source === "MANUAL") {
        this.logger?.warn(
          "[Audit] Platform Administrator manual Sarvam recording retrieval failed",
          {
            action: "SARVAM_RECORDING_MANUAL_REFETCH",
            callId: call.id,
            tenantId: call.tenantId,
            interactionId: resolvedInteractionId,
            attemptId: targetAttempt.attempt_id,
            adminUserId,
            outcome: "FAILED",
            failureReason: errorMessage,
            timestamp: new Date().toISOString(),
          },
        );
      }

      throw err;
    }
  }
}

