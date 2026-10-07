import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import type { BolnaTemplateProvider } from "../../../platform-agents/application/interfaces/bolna-template-provider.interface";
import { BolnaApiKeyNotFoundError } from "../../domain/errors/bolna-api-key.errors";
import { encryptKey } from "../../../../shared/utils/encryption";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { AppError } from "../../../../shared/errors";

export interface UpdateBolnaApiKeyInput {
  keyId: string;
  keyIdentifier?: string;
  plainTextKey?: string;
  type?: "GENERAL" | "CUSTOM";
}

export class UpdateBolnaApiKeyUseCase {
  constructor(
    private readonly apiKeyRepo: BolnaApiKeyRepository,
    private readonly templateProvider: BolnaTemplateProvider,
    private readonly logger?: Logger,
  ) {}

  async execute(input: UpdateBolnaApiKeyInput) {
    const key = await this.apiKeyRepo.findById(input.keyId);
    if (!key) throw new BolnaApiKeyNotFoundError(input.keyId);

    // If rotating the actual Bolna API key, validate first
    if (input.plainTextKey) {
      const newEncryptedKey = encryptKey(input.plainTextKey);
      const originalEncryptedKey = key.encryptedKey;

      // Temporarily update to validate the new key
      await this.apiKeyRepo.updateKey(input.keyId, {
        encryptedKey: newEncryptedKey,
      });

      try {
        const profile = await this.templateProvider.fetchUserProfile(
          input.keyId,
        );

        await this.apiKeyRepo.updateProfile(input.keyId, {
          bolnaProfileName: profile.name,
          bolnaProfileEmail: profile.email,
          bolnaWalletBalance: profile.wallet,
          bolnaConcurrencyMax: profile.concurrency?.max ?? null,
          bolnaConcurrencyCurrent: profile.concurrency?.current ?? null,
          bolnaProfileFetchedAt: new Date(),
        });

        this.logger?.info("API key rotated and profile re-validated", {
          action: "bolna_key.rotated",
          keyId: input.keyId,
          newProfileName: profile.name,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);

        try {
          await this.apiKeyRepo.updateKey(input.keyId, {
            encryptedKey: originalEncryptedKey,
          });
        } catch (rollbackErr) {
          this.logger?.error("API key rotation rollback failed", {
            action: "bolna_key.rotation_rollback_failed",
            keyId: input.keyId,
            originalError: reason,
            rollbackError:
              rollbackErr instanceof Error
                ? rollbackErr.message
                : String(rollbackErr),
            rollbackStack:
              rollbackErr instanceof Error ? rollbackErr.stack : undefined,
          });

          throw new AppError(
            500,
            `API key rotation failed and rollback failed: ${reason}`,
            "BOLNA_KEY_ROLLBACK_FAILED",
            false,
            rollbackErr,
          );
        }

        this.logger?.error("API key rotation failed, rolled back", {
          action: "bolna_key.rotation_rolled_back",
          keyId: input.keyId,
          reason,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });

        throw new AppError(
          400,
          `New API key validation failed: ${reason}`,
          "BOLNA_KEY_VALIDATION_FAILED",
          true,
          err,
        );
      }
    }

    // Update metadata fields (name, type)
    const metadataUpdate: Record<string, string> = {};
    if (input.keyIdentifier) {
      metadataUpdate.keyIdentifier = input.keyIdentifier;
    }
    if (input.type) {
      metadataUpdate.type = input.type;
    }

    if (Object.keys(metadataUpdate).length > 0) {
      await this.apiKeyRepo.updateKey(input.keyId, metadataUpdate);
    }

    return { message: "API key updated successfully" };
  }
}
