// src/modules/payments/container.ts
import { RazorpayProvider } from "../../shared/config/external/payments/razorpay.provider";
import type { IPaymentProvider } from "../../shared/config/external/payments/payment-provider.interface";
import type { WalletRepository } from "../wallet/application/interfaces/wallet-repository.interface";
import type { PlanRepository } from "../plans/application/interfaces/plan-repository.interface";
import type { AutoAssignKeyUseCase } from "../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import type { IEmailService } from "../../shared/config/external/email/email.interface";

// Repositories
import { PrismaRechargeRepository } from "./infrastructure/repositories/prisma-recharge.repository";
import { PrismaTenantEmailRepository } from "./infrastructure/repositories/prisma-tenant-email.repository";

// Use cases
import { CreateOrderUseCase } from "./application/use-cases/create-order.use-case";
import { CreateOnboardingOrderUseCase } from "./application/use-cases/create-onboarding-order.use-case";
import { VerifyPaymentUseCase } from "./application/use-cases/verify-payment.use-case";
import { CompletePaymentUseCase } from "./application/use-cases/complete-payment.use-case";
import { GetOrderStatusUseCase } from "./application/use-cases/get-order-status.use-case";
import { ProcessRazorpayWebhookUseCase } from "./application/use-cases/process-razorpay-webhook.use-case";
import { GetPaymentSummaryUseCase } from "./application/use-cases/get-payment-summary.use-case";
import { ListAdminPaymentsUseCase } from "./application/use-cases/list-admin-payments.use-case";
import { ActivateFreeOnboardingUseCase } from "./application/use-cases/activate-free-onboarding.use-case";

// Controllers
import { TenantPaymentController } from "./presentation/tenant-payment.controller";
import { AdminPaymentController } from "./presentation/admin-payment.controller";
import { RazorpayWebhookController } from "./presentation/razorpay-webhook.controller";
import { CreatePlanUpgradeOrderUseCase } from "./application/use-cases/create-plan-upgrade-order.use-case";

export interface PaymentModuleDeps {
  walletRepository: WalletRepository;
  planRepository: PlanRepository;
  autoAssignKey: AutoAssignKeyUseCase;
  email: IEmailService;
  paymentProvider?: IPaymentProvider;
}

export interface PaymentModule {
  tenantController: TenantPaymentController;
  adminController: AdminPaymentController;
  webhookController: RazorpayWebhookController;
  provider: IPaymentProvider;
  useCases: {
    completePayment: CompletePaymentUseCase;
    activateFreeOnboarding: ActivateFreeOnboardingUseCase;
  };
}

export function buildPaymentModule(deps: PaymentModuleDeps): PaymentModule {
  const provider = deps.paymentProvider ?? new RazorpayProvider();

  // ── Repositories ──────────────────────────────────────────
  const rechargeRepo = new PrismaRechargeRepository();
  const tenantEmailRepo = new PrismaTenantEmailRepository();

  // ── Use cases ─────────────────────────────────────────────
  const completePayment = new CompletePaymentUseCase(
    rechargeRepo,
    deps.walletRepository,
    deps.planRepository,
    deps.autoAssignKey,
    deps.email,
    tenantEmailRepo,
  );

  const createTopupOrder = new CreateOrderUseCase(
    deps.planRepository,
    deps.walletRepository,
    rechargeRepo,
    provider,
  );

  const createOnboardingOrder = new CreateOnboardingOrderUseCase(
    deps.planRepository,
    deps.walletRepository,
    rechargeRepo,
    provider,
  );

  const createPlanUpgradeOrder = new CreatePlanUpgradeOrderUseCase(
    deps.planRepository,
    deps.walletRepository,
    rechargeRepo,
    provider,
  );

  const verifyPayment = new VerifyPaymentUseCase(
    provider,
    rechargeRepo,
    completePayment,
  );

  const getOrderStatus = new GetOrderStatusUseCase(rechargeRepo, provider);

  const processWebhook = new ProcessRazorpayWebhookUseCase(
    provider,
    completePayment,
  );

  const getPaymentSummary = new GetPaymentSummaryUseCase(rechargeRepo);
  const listAdminPayments = new ListAdminPaymentsUseCase(rechargeRepo);
  const activateFreeOnboarding = new ActivateFreeOnboardingUseCase(
    deps.planRepository,
    deps.walletRepository,
    deps.autoAssignKey,
  );

  // ── Assemble ──────────────────────────────────────────────
  return {
    provider,
    useCases: { completePayment, activateFreeOnboarding },
    tenantController: new TenantPaymentController(
      createTopupOrder,
      createOnboardingOrder,
      createPlanUpgradeOrder,
      verifyPayment,
      getOrderStatus,
    ),
    adminController: new AdminPaymentController(
      listAdminPayments,
      getPaymentSummary,
      activateFreeOnboarding,
    ),
    webhookController: new RazorpayWebhookController(processWebhook),
  };
}
