import type { Job } from "bull";
import prisma from "../../../../shared/config/database/prisma";
import type { InboundNumberRepository } from "../../application/interfaces/inbound-number-repository.interface";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface InboundNumberSyncJobData {
  inboundNumberId: string;
  action: "LINK" | "UNLINK";
  assistantId?: string;
}

export class InboundNumberSyncWorker {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly bolnaFactory: IBolnaClientFactory,
    private readonly logger?: Logger,
  ) {}

  async process(job: Job<InboundNumberSyncJobData>): Promise<void> {
    const { inboundNumberId, action, assistantId } = job.data;

    this.logger?.info("Processing inbound number provider sync job", {
      action: "inbound_number.sync.start",
      jobId: String(job.id),
      inboundNumberId,
      syncAction: action,
    });

    const inboundNumber = await this.repository.findById(inboundNumberId);
    if (!inboundNumber) {
      this.logger?.warn("Inbound number not found for sync job", {
        inboundNumberId,
      });
      return;
    }

    try {
      // If the number is a custom / third-party telephony provider (e.g., Vobiz, custom SIP)
      // that is managed directly on that external telephony service rather than Bolna's setupInbound API:
      if (inboundNumber.provider !== "bolna" && !inboundNumber.bolnaApiKeyId) {
        await this.repository.update(inboundNumber.id, {
          providerSyncStatus: "SYNCED",
          providerSyncError: null,
        });
        this.logger?.info("Custom telephony number marked as synced", {
          action: "inbound_number.sync.custom_provider",
          inboundNumberId,
          provider: inboundNumber.provider,
          syncAction: action,
        });
        return;
      }

      // Resolve Bolna client: prefer tenant's configured key if assigned, else number's bolnaApiKeyId, else platform default
      let bolnaClient;
      if (inboundNumber.tenantId) {
        bolnaClient = await this.bolnaFactory.forTenant(inboundNumber.tenantId);
      } else if (inboundNumber.bolnaApiKeyId) {
        bolnaClient = await this.bolnaFactory.forApiKey(inboundNumber.bolnaApiKeyId);
      } else {
        // Fallback to active platform default key
        const defaultKey = await prisma.bolnaApiKey.findFirst({
          where: { isPlatformDefault: true, isActive: true },
          select: { id: true },
        });
        if (!defaultKey) {
          throw new Error("No active Bolna API key found for inbound number sync.");
        }
        bolnaClient = await this.bolnaFactory.forApiKey(defaultKey.id);
      }

      if (action === "LINK") {
        const targetAssistantId = assistantId ?? inboundNumber.assistantId;
        if (!targetAssistantId) {
          throw new Error("Cannot link inbound number: assistantId is missing.");
        }

        const assistant = await prisma.assistant.findUnique({
          where: { id: targetAssistantId },
          include: { platformAgent: true },
        });

        if (!assistant || !assistant.platformAgent?.bolnaId) {
          throw new Error(
            `Assistant '${targetAssistantId}' or its platform agent Bolna ID was not found.`,
          );
        }

        const bolnaAgentId = assistant.platformAgent.bolnaId;
        await bolnaClient.phoneNumbers.setupInbound(
          inboundNumber.bolnaPhoneNumberId,
          bolnaAgentId,
        );

        await this.repository.update(inboundNumber.id, {
          providerSyncStatus: "SYNCED",
          providerSyncError: null,
        });

        this.logger?.info("Inbound number linked successfully with Bolna", {
          action: "inbound_number.sync.linked",
          inboundNumberId,
          bolnaAgentId,
        });
      } else if (action === "UNLINK") {
        await bolnaClient.phoneNumbers.unlinkInbound(
          inboundNumber.bolnaPhoneNumberId,
        );

        await this.repository.update(inboundNumber.id, {
          providerSyncStatus: "SYNCED",
          providerSyncError: null,
        });

        this.logger?.info("Inbound number unlinked successfully from Bolna", {
          action: "inbound_number.sync.unlinked",
          inboundNumberId,
        });
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error during Bolna sync";

      this.logger?.error("Inbound number sync failed", err, {
        action: "inbound_number.sync.failed",
        inboundNumberId,
        attempt: job.attemptsMade,
      });

      await this.repository.update(inboundNumber.id, {
        providerSyncStatus: "FAILED",
        providerSyncError: errorMessage,
      });

      throw err; // Re-throw to allow Bull retry with exponential backoff
    }
  }
}
