import { PrismaAuthRepository } from "../modules/auth/infrastructure/repositories/prisma-auth.repository";
import { JwtTokenService } from "../modules/auth/infrastructure/services/jwt-token.service";
import { JwtPasswordResetTokenService } from "../modules/auth/infrastructure/services/jwt-password-reset-token.service";
import { BcryptPasswordService } from "../modules/auth/infrastructure/services/bcrypt-password.service";
import { AuthenticateMiddleware } from "../shared/middleware/authenticate";
import { AuthorizeMiddleware } from "../shared/middleware/authorize";
import { EnforcePlanMiddleware } from "../shared/middleware/enforce-plan";
import redis from "../shared/config/database/redis";
import {
  BolnaClientFactory,
  type IBolnaClientFactory,
} from "../shared/config/external/bolna/bolna-client.factory";
import { ResendEmailService } from "../shared/config/external/email/resend.email";
import { RedisOtpService } from "../modules/auth/infrastructure/services/redis-otp.service";

// Module container builders
import { buildAuthModule, type AuthModule } from "../modules/auth/container";
import {
  buildAssistantModule,
  type AssistantModule,
} from "../modules/assistants/container";
import {
  buildTenantModule,
  type TenantModule,
} from "../modules/tenants/container";
import {
  buildCampaignModule,
  type CampaignModule,
} from "../modules/campaigns/container";
import {
  buildBatchModule,
  type BatchModule,
} from "../modules/batches/container";
import { buildLeadModule, type LeadModule } from "../modules/leads/container";
import { buildCallModule, type CallModule } from "../modules/calls/container";
import {
  buildDashboardModule,
  type DashboardModule,
} from "../modules/dashboard/container";
import { buildUserModule, type UserModule } from "../modules/users/container";
import {
  buildWebhookModule,
  type WebhookModule,
} from "../modules/webhooks/container";
import { buildPlanModule, type PlanModule } from "../modules/plans/container";
import {
  buildBolnaApiKeyModule,
  type BolnaApiKeyModule,
} from "../modules/bolna-api-keys/container";
import {
  buildWalletModule,
  type WalletModule,
} from "../modules/wallet/container";
import {
  buildPaymentModule,
  type PaymentModule,
} from "../modules/payments/container";
import {
  buildInviteModule,
  type InviteModule,
} from "../modules/invites/container";
import {
  buildPlatformAgentModule,
  type PlatformAgentModule,
} from "../modules/platform-agents/container";
import {
  buildExtractionModule,
  type ExtractionModule,
} from "../modules/extractions/container";
import {
  buildIndustryPackModule,
  type IndustryPackModule,
} from "../modules/industry-packs/container";
import {
  buildClassifierModule,
  type ClassifierModule,
} from "../modules/classifier/container";

// Repository Concrete Implementations for DI Wiring
import { PrismaRechargeRepository } from "../modules/payments/infrastructure/repositories/prisma-recharge.repository";
import { PrismaBolnaApiKeyRepository } from "../modules/bolna-api-keys/infrastructure/repositories/prisma-bolna-api-key.repository";
import { PrismaAssistantRepository } from "../modules/assistants/infrastructure/repositories/prisma-assistant.repository";
import { PrismaPlatformAgentRepository } from "../modules/platform-agents/infrastructure/repositories/prisma-platform-agent.repository";
import { BolnaTemplateProviderImpl } from "../modules/platform-agents/infrastructure/services/bolna-template.provider";

// Logging
import type { Logger } from "../shared/logging/logger.interface";
import { createLogger } from "../shared/config/logging/winston.logger";

export interface AppContainer {
  logger: Logger;
  auth: AuthModule;
  assistants: AssistantModule;
  tenants: TenantModule;
  campaigns: CampaignModule;
  batches: BatchModule;
  leads: LeadModule;
  calls: CallModule;
  dashboard: DashboardModule;
  users: UserModule;
  webhooks: WebhookModule;

  plans: PlanModule;
  bolnaApiKeys: BolnaApiKeyModule;
  wallet: WalletModule;
  payments: PaymentModule;
  invites: InviteModule;
  platformAgents: PlatformAgentModule;
  extractions: ExtractionModule;
  industryPacks: IndustryPackModule;
  classifier: ClassifierModule;

  // Backwards compatibility references
  assistantModule: AssistantModule;
  platformAgentModule: PlatformAgentModule;
  bolnaApiKeyModule: BolnaApiKeyModule;

  authenticate: AuthenticateMiddleware;
  authorize: AuthorizeMiddleware;
  enforcePlan: EnforcePlanMiddleware;

  bolnaClientFactory: IBolnaClientFactory;
}

export function buildContainer(): AppContainer {
  const logger = createLogger();

  // ── Infrastructure & Shared Drivers ──────────────────────────────────
  const authRepository = new PrismaAuthRepository();
  const tokenService = new JwtTokenService();
  const passwordService = new BcryptPasswordService();
  const email = new ResendEmailService(logger.child({ module: "email" }));
  const otpService = new RedisOtpService(redis);
  const passwordResetTokenService = new JwtPasswordResetTokenService(redis);

  const apiKeyRepository = new PrismaBolnaApiKeyRepository();
  const bolnaClientFactory = new BolnaClientFactory(
    apiKeyRepository,
    logger.child({ module: "bolna-factory" }),
  );

  const rechargeRepository = new PrismaRechargeRepository();

  // ── Core Repositories Instantiated for Cross-Module Wiring ───────────
  const assistantRepo = new PrismaAssistantRepository();
  const platformAgentRepo = new PrismaPlatformAgentRepository();
  const templateProvider = new BolnaTemplateProviderImpl(apiKeyRepository);

  // ── Module Construction ─────────────────────────────────────────────

  // 1. Auth Module
  const auth = buildAuthModule({
    authRepository,
    tokenService,
    passwordService,
    otpService,
    passwordResetTokenService,
    emailService: email,
    logger,
  });

  // 2. Plans Module
  const plans = buildPlanModule();

  // 3. Platform Agents Module (depends only on core repositories and logger)
  const platformAgents = buildPlatformAgentModule({
    platformAgentRepo,
    templateProvider,
    logger,
  });

  // 4. Bolna API Keys Module (requires cross-module cloning parameters)
  const bolnaApiKeys = buildBolnaApiKeyModule({
    assistantRepo,
    platformAgentRepo,
    templateProvider,
    cloneAgentUseCase: platformAgents.cloneAgentToWorkspaceUseCase,
    logger,
  });

  const enforcePlan = new EnforcePlanMiddleware(plans.repository);

  // 5. Wallet Module
  const wallet = buildWalletModule({
    planRepository: plans.repository,
    bolnaClientFactory,
    email,
    logger,
  });

  // 6. Payments Module
  const payments = buildPaymentModule({
    walletRepository: wallet.repository,
    planRepository: plans.repository,
    autoAssignKey: bolnaApiKeys.useCases.autoAssignKey,
    email,
    logger,
  });

  // 7. Invites Module
  const invites = buildInviteModule({
    planRepository: plans.repository,
    authRepository,
    walletRepository: wallet.repository,
    rechargeRepository,
    autoAssignKeyUseCase: bolnaApiKeys.useCases.autoAssignKey,
    passwordService,
    tokenService,
    emailService: email,
  });

  // 8. Assistants Module
  const assistants = buildAssistantModule({ bolnaClientFactory });

  const classifier = buildClassifierModule({ logger });

  const webhooks = buildWebhookModule({
    debitWalletForCall: wallet.useCases.debitWalletForCall,
    classifierQueue: classifier.queue,
    logger,
  });

  const calls = buildCallModule({
    bolnaClientFactory,
    debitWalletForCall: wallet.useCases.debitWalletForCall,
    classifierQueue: classifier.queue,
    logger,
  });

  return {
    logger,
    auth,
    assistants,
    tenants: buildTenantModule(),
    campaigns: buildCampaignModule({ logger }),
    batches: buildBatchModule({
      bolnaClientFactory,
      checkBalanceForBatch: wallet.useCases.checkBalanceForBatch,
      logger,
    }),
    leads: buildLeadModule(),
    calls,
    dashboard: buildDashboardModule(),
    users: buildUserModule({ passwordService }),
    webhooks,

    platformAgents,
    extractions: buildExtractionModule(),
    industryPacks: buildIndustryPackModule(),

    plans,
    bolnaApiKeys,
    wallet,
    payments,
    invites,
    classifier,

    // Aliased references preserving clean DI architecture
    assistantModule: assistants,
    platformAgentModule: platformAgents,
    bolnaApiKeyModule: bolnaApiKeys,

    authenticate: new AuthenticateMiddleware(tokenService, authRepository),
    authorize: new AuthorizeMiddleware(),
    enforcePlan,
    bolnaClientFactory,
  };
}
