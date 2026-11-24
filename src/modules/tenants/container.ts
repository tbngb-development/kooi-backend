import type Redis from "ioredis";
import { PrismaTenantRepository } from "./infrastructure/repositories/prisma-tenant.repository";
import type { TenantRepository } from "./application/interfaces/tenant-repository.interface";
import type { OtpService } from "../auth/application/interfaces/otp-service.interface";
import type { IEmailService } from "../../shared/config/external/email/email.interface";
import type { Logger } from "../../shared/logging/logger.interface";
import type { BolnaApiKeyRepository } from "../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import type { ISarvamApiKeyRepository } from "../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";
import {
  TenantVoiceProviderService,
  type ITenantVoiceProviderService,
} from "./application/services/tenant-voice-provider.service";
import { ListTenantsUseCase } from "./application/use-cases/list-tenants.use-case";
import { GetTenantUseCase } from "./application/use-cases/get-tenant.use-case";
import { UpdateTenantUseCase } from "./application/use-cases/update-tenant.use-case";
import { GetTenantStatsUseCase } from "./application/use-cases/get-tenant-stats.use-case";
import { SendTenantMobileOtpUseCase } from "./application/use-cases/send-tenant-mobile-otp.use-case";
import { VerifyTenantMobileOtpUseCase } from "./application/use-cases/verify-tenant-mobile-otp.use-case";
import { TenantWorkspaceController } from "./presentation/tenant-workspace.controller";
import { AdminTenantController } from "./presentation/admin-tenant.controller";

export interface TenantModuleDependencies {
  otpService: OtpService;
  emailService: IEmailService;
  redis: Redis;
  logger: Logger;
  bolnaApiKeyRepository?: BolnaApiKeyRepository;
  sarvamApiKeyRepository?: ISarvamApiKeyRepository;
  voiceProviderService?: ITenantVoiceProviderService;
}

export interface TenantModule {
  workspaceController: TenantWorkspaceController;
  adminController: AdminTenantController;
  repository: TenantRepository;
  voiceProviderService?: ITenantVoiceProviderService;
}

export function buildTenantModule(deps: TenantModuleDependencies): TenantModule {
  const repository = new PrismaTenantRepository();

  const voiceProviderService =
    deps.voiceProviderService ??
    (deps.bolnaApiKeyRepository && deps.sarvamApiKeyRepository
      ? new TenantVoiceProviderService(
          repository,
          deps.bolnaApiKeyRepository,
          deps.sarvamApiKeyRepository,
        )
      : undefined);

  const getTenant = new GetTenantUseCase(repository);
  const updateTenant = new UpdateTenantUseCase(repository, voiceProviderService);
  const getTenantStats = new GetTenantStatsUseCase(repository);
  const sendTenantMobileOtp = new SendTenantMobileOtpUseCase(
    repository,
    deps.otpService,
    deps.emailService,
    deps.redis,
    deps.logger,
  );
  const verifyTenantMobileOtp = new VerifyTenantMobileOtpUseCase(
    repository,
    deps.otpService,
    deps.redis,
    deps.logger,
  );

  return {
    workspaceController: new TenantWorkspaceController(
      getTenant,
      updateTenant,
      getTenantStats,
      sendTenantMobileOtp,
      verifyTenantMobileOtp,
    ),
    adminController: new AdminTenantController(
      new ListTenantsUseCase(repository),
      getTenant,
      updateTenant,
      getTenantStats,
    ),
    repository,
    voiceProviderService,
  };
}
