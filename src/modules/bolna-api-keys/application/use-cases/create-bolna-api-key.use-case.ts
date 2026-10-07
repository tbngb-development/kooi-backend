import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import type { BolnaTemplateProvider } from "../../../platform-agents/application/interfaces/bolna-template-provider.interface";
import { encryptKey } from "../../../../shared/utils/encryption";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface CreateBolnaApiKeyInput {
  keyIdentifier: string;
  plainTextKey: string;
  type: "GENERAL" | "CUSTOM";
  isPlatformDefault?: boolean;
  createdBy: string;
}

export class CreateBolnaApiKeyUseCase {
  constructor(
    private readonly repo: BolnaApiKeyRepository,
    private readonly templateProvider: BolnaTemplateProvider,
    private readonly logger?: Logger,
  ) {}

  async execute(input: CreateBolnaApiKeyInput) {
    const encryptedKey = encryptKey(input.plainTextKey);

    const key = await this.repo.create({
      keyIdentifier: input.keyIdentifier,
      encryptedKey,
      type: input.type,
      isPlatformDefault: input.isPlatformDefault ?? false,
      createdBy: input.createdBy,
    });

    // Best-effort profile fetch from Bolna GET /user/me
    let profileWarning: string | null = null;

    try {
      const profile = await this.templateProvider.fetchUserProfile(key.id);

      await this.repo.updateProfile(key.id, {
        bolnaProfileName: profile.name,
        bolnaProfileEmail: profile.email,
        bolnaWalletBalance: profile.wallet,
        bolnaConcurrencyMax: profile.concurrency?.max ?? null,
        bolnaConcurrencyCurrent: profile.concurrency?.current ?? null,
        bolnaProfileFetchedAt: new Date(),
      });

      this.logger?.info("Bolna profile fetched on key creation", {
        action: "bolna_key.create_profile_success",
        keyId: key.id,
        profileName: profile.name,
        wallet: profile.wallet,
      });
    } catch (err) {
      profileWarning = err instanceof Error ? err.message : String(err);

      this.logger?.warn("Profile fetch failed on key creation (non-fatal)", {
        action: "bolna_key.create_profile_failed",
        keyId: key.id,
        error: profileWarning,
      });
    }

    return {
      id: key.id,
      keyIdentifier: key.keyIdentifier,
      type: key.type,
      isPlatformDefault: key.isPlatformDefault,
      isActive: key.isActive,
      bolnaProfileName: key.bolnaProfileName,
      bolnaProfileEmail: key.bolnaProfileEmail,
      bolnaWalletBalance: key.bolnaWalletBalance,
      bolnaConcurrencyMax: key.bolnaConcurrencyMax,
      bolnaProfileFetchedAt: key.bolnaProfileFetchedAt,
      profileWarning,
      createdAt: key.createdAt,
    };
  }
}
