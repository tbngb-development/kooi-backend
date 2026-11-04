import type { VoiceProvider } from "@prisma/client";
import type { TenantRepository, TenantWithCounts } from "../interfaces/tenant-repository.interface";
import type { BolnaApiKeyRepository } from "../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import type { ISarvamApiKeyRepository } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";
import {
  TenantNotFoundError,
  MissingVoiceProviderCredentialError,
  InactiveVoiceProviderCredentialError,
  InvalidVoiceProviderError,
} from "../../domain/tenant.errors";

export interface ResolvedVoiceProviderCredential {
  provider: VoiceProvider;
  credential: {
    id: string;
    isActive: boolean;
    provider: VoiceProvider;
    metadata?: Record<string, unknown>;
  };
}

export interface ITenantVoiceProviderService {
  resolveActiveProvider(tenantId: string): Promise<ResolvedVoiceProviderCredential>;
  validateSwitchEligibility(
    tenantId: string,
    targetProvider: VoiceProvider,
    targetBolnaKeyId?: string | null,
  ): Promise<void>;
}

export class TenantVoiceProviderService implements ITenantVoiceProviderService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly bolnaKeyRepo: BolnaApiKeyRepository,
    private readonly sarvamKeyRepo: ISarvamApiKeyRepository,
  ) {}

  /**
   * Resolves the active voice provider and its active credential for the given tenant.
   * Strict boundary: NEVER falls back to another provider if the active provider's credential is invalid or missing.
   */
  async resolveActiveProvider(
    tenantId: string,
  ): Promise<ResolvedVoiceProviderCredential> {
    if (!tenantId || typeof tenantId !== "string" || tenantId.trim().length === 0) {
      throw new TenantNotFoundError();
    }

    const tenant = await this.tenantRepo.findById(tenantId.trim());
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    const selectedProvider: VoiceProvider = tenant.voiceProvider ?? "BOLNA";

    switch (selectedProvider) {
      case "BOLNA": {
        const bolnaKeyId = tenant.bolnaApiKeyId;
        if (!bolnaKeyId) {
          throw new MissingVoiceProviderCredentialError("BOLNA");
        }

        const bolnaKey = await this.bolnaKeyRepo.findById(bolnaKeyId);
        if (!bolnaKey) {
          throw new MissingVoiceProviderCredentialError("BOLNA");
        }

        if (!bolnaKey.isActive) {
          throw new InactiveVoiceProviderCredentialError("BOLNA");
        }

        return {
          provider: "BOLNA",
          credential: {
            id: bolnaKey.id,
            isActive: bolnaKey.isActive,
            provider: "BOLNA",
            metadata: {
              keyIdentifier: bolnaKey.keyIdentifier,
              type: bolnaKey.type,
              bolnaProfileName: bolnaKey.bolnaProfileName,
            },
          },
        };
      }

      case "SARVAM": {
        const sarvamKey = await this.sarvamKeyRepo.findByTenantId(tenant.id);
        if (!sarvamKey) {
          throw new MissingVoiceProviderCredentialError("SARVAM");
        }

        if (!sarvamKey.isActive) {
          throw new InactiveVoiceProviderCredentialError("SARVAM");
        }

        return {
          provider: "SARVAM",
          credential: {
            id: sarvamKey.id,
            isActive: sarvamKey.isActive,
            provider: "SARVAM",
            metadata: {
              workspaceId: sarvamKey.workspaceId,
              organizationId: sarvamKey.organizationId,
            },
          },
        };
      }

      default:
        throw new InvalidVoiceProviderError(selectedProvider);
    }
  }

  /**
   * Validates whether a tenant is eligible to switch to or update with targetProvider.
   * Validates target credential existence, active state, and eligibility.
   */
  async validateSwitchEligibility(
    tenantId: string,
    targetProvider: VoiceProvider,
    targetBolnaKeyId?: string | null,
  ): Promise<void> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    if (targetProvider === "BOLNA") {
      const keyIdToUse = targetBolnaKeyId !== undefined ? targetBolnaKeyId : tenant.bolnaApiKeyId;
      if (!keyIdToUse) {
        throw new MissingVoiceProviderCredentialError(
          "BOLNA",
          "Cannot switch to BOLNA: No Bolna API Key is selected or assigned.",
        );
      }

      const bolnaKey = await this.bolnaKeyRepo.findById(keyIdToUse);
      if (!bolnaKey) {
        throw new MissingVoiceProviderCredentialError(
          "BOLNA",
          `Referenced Bolna API Key (${keyIdToUse}) does not exist.`,
        );
      }

      if (!bolnaKey.isActive) {
        throw new InactiveVoiceProviderCredentialError(
          "BOLNA",
          `Referenced Bolna API Key (${bolnaKey.keyIdentifier}) is inactive.`,
        );
      }
    } else if (targetProvider === "SARVAM") {
      const sarvamKey = await this.sarvamKeyRepo.findByTenantId(tenant.id);
      if (!sarvamKey) {
        throw new MissingVoiceProviderCredentialError(
          "SARVAM",
          "Cannot switch to SARVAM: Workspace does not have a configured Sarvam API Key.",
        );
      }

      if (!sarvamKey.isActive) {
        throw new InactiveVoiceProviderCredentialError(
          "SARVAM",
          "Cannot switch to SARVAM: The configured Sarvam API Key is currently deactivated.",
        );
      }
    } else {
      throw new InvalidVoiceProviderError(targetProvider);
    }
  }
}

