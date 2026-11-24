import { type TenantRepository } from "../interfaces/tenant-repository.interface";
import { type UpdateTenantInput } from "../dto/tenant.dto";
import { TenantNotFoundError } from "../../domain/tenant.errors";
import type { ITenantVoiceProviderService } from "../services/tenant-voice-provider.service";

export class UpdateTenantUseCase {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly voiceProviderService?: ITenantVoiceProviderService,
  ) {}

  async execute(id: string, input: UpdateTenantInput, adminUserId?: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new TenantNotFoundError();

    const dataToUpdate: UpdateTenantInput = { ...input };

    if (input.isActive === false) {
      dataToUpdate.suspendedAt = input.suspendedAt ?? new Date();
      if (adminUserId && !dataToUpdate.suspendedBy) {
        dataToUpdate.suspendedBy = adminUserId;
      }
    } else if (input.isActive === true) {
      dataToUpdate.suspensionReason = null;
      dataToUpdate.suspendedAt = null;
      dataToUpdate.suspendedBy = null;
    }

    // Validate voice provider and credential assignment if requested
    if (
      this.voiceProviderService &&
      (input.voiceProvider !== undefined || input.bolnaApiKeyId !== undefined)
    ) {
      const targetProvider = input.voiceProvider ?? tenant.voiceProvider ?? "BOLNA";
      await this.voiceProviderService.validateSwitchEligibility(
        id,
        targetProvider,
        input.bolnaApiKeyId,
      );
    }

    return this.tenantRepo.update(id, dataToUpdate);
  }
}
