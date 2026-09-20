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
import { PrismaRechargeRepository } from "../modules/payments/infrastructure/repositories/prisma-recharge.repository";

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
import { PrismaBolnaApiKeyRepository } from "../modules/bolna-api-keys/infrastructure/repositories/prisma-bolna-api-key.repository";

export interface AppContainer {
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
  assistantModule: AssistantModule;
  platformAgentModule: PlatformAgentModule;
  bolnaApiKeyModule: BolnaApiKeyModule;

  authenticate: AuthenticateMiddleware;
  authorize: AuthorizeMiddleware;
  enforcePlan: EnforcePlanMiddleware;

  bolnaClientFactory: IBolnaClientFactory;
}

export function buildContainer(): AppContainer {
  // ── Infrastructure ──────────────────────────────────────────────────
  const authRepository = new PrismaAuthRepository();
  const tokenService = new JwtTokenService();
  const passwordService = new BcryptPasswordService();
  const email = new ResendEmailService();
  const otpService = new RedisOtpService(redis);
  const passwordResetTokenService = new JwtPasswordResetTokenService(redis);

  const apiKeyRepository = new PrismaBolnaApiKeyRepository();
  const bolnaClientFactory = new BolnaClientFactory(apiKeyRepository);

  const assistantModule = buildAssistantModule({
    bolnaClientFactory,
  });

  const platformAgentModule = buildPlatformAgentModule();

  // shared repository
  const rechargeRepository = new PrismaRechargeRepository();

  const auth = buildAuthModule({
    authRepository,
    tokenService,
    passwordService,
    otpService,
    passwordResetTokenService,
    emailService: email,
  });

  // ── Core Commercial Foundation ──────────────────────────────────────
  const plans = buildPlanModule();
  const bolnaApiKeys = buildBolnaApiKeyModule();
  const enforcePlan = new EnforcePlanMiddleware(plans.repository);

  // ── Wallet (depends on plans + bolna + email) ───────────────────────
  const wallet = buildWalletModule({
    planRepository: plans.repository,
    bolnaClientFactory,
    email,
  });

  // ── Payments (depends on wallet + plans + bolna key auto-assign) ─────
  const payments = buildPaymentModule({
    walletRepository: wallet.repository,
    planRepository: plans.repository,
    autoAssignKey: bolnaApiKeys.useCases.autoAssignKey,
    email,
  });

  // ── Invites ─────────────────────────────────────────────────────────
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

  // ── Assembled Domain Modules ────────────────────────────────────────
  return {
    auth,
    assistants: buildAssistantModule({ bolnaClientFactory }),
    tenants: buildTenantModule(),
    campaigns: buildCampaignModule(),
    batches: buildBatchModule({
      bolnaClientFactory,
      checkBalanceForBatch: wallet.useCases.checkBalanceForBatch,
    }),
    leads: buildLeadModule(),
    calls: buildCallModule(),
    dashboard: buildDashboardModule(),
    users: buildUserModule({ passwordService }),
    webhooks: buildWebhookModule({
      debitWalletForCall: wallet.useCases.debitWalletForCall,
    }),
    platformAgents: buildPlatformAgentModule(),
    extractions: buildExtractionModule(),
    industryPacks: buildIndustryPackModule(),

    plans,
    bolnaApiKeys,
    wallet,
    payments,
    invites,

    assistantModule,
    platformAgentModule,
    bolnaApiKeyModule: buildBolnaApiKeyModule(),

    authenticate: new AuthenticateMiddleware(tokenService, authRepository),
    authorize: new AuthorizeMiddleware(),
    enforcePlan,
    bolnaClientFactory,
  };
}
