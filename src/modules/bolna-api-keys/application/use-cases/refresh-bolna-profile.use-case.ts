import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import type { BolnaTemplateProvider } from "../../../platform-agents/application/interfaces/bolna-template-provider.interface";
import { BolnaApiKeyNotFoundError } from "../../domain/errors/bolna-api-key.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class RefreshBolnaProfileUseCase {
  constructor(
    private readonly apiKeyRepo: BolnaApiKeyRepository,
    private readonly templateProvider: BolnaTemplateProvider,
    private readonly logger?: Logger,
  ) {}

  async execute(keyId: string) {
    const key = await this.apiKeyRepo.findById(keyId);
    if (!key) throw new BolnaApiKeyNotFoundError(keyId);

    try {
      const profile = await this.templateProvider.fetchUserProfile(keyId);
      this.logger?.debug("profile data: ", { profile });

      await this.apiKeyRepo.updateProfile(keyId, {
        bolnaProfileName: profile.name,
        bolnaProfileEmail: profile.email,
        bolnaWalletBalance: profile.wallet,
        bolnaConcurrencyMax: profile.concurrency?.max ?? null,
        bolnaConcurrencyCurrent: profile.concurrency?.current ?? null,
        bolnaProfileFetchedAt: new Date(),
      });

      this.logger?.info("Bolna profile refreshed", {
        action: "bolna_key.profile_refreshed",
        keyId,
        profileName: profile.name,
        wallet: profile.wallet,
        concurrency: profile.concurrency,
      });

      return {
        success: true,
        profile: {
          name: profile.name,
          email: profile.email,
          wallet: profile.wallet,
          concurrency: profile.concurrency,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger?.warn("Bolna profile fetch failed", {
        action: "bolna_key.profile_fetch_failed",
        keyId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
