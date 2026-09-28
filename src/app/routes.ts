import { Router } from "express";
import type { AppContainer } from "./container";
import { buildTenantAuthRoutes } from "../modules/auth/presentation/tenant-auth.routes";
import { buildAdminAuthRoutes } from "../modules/auth/presentation/admin-auth.routes";
import { buildTenantAssistantRoutes } from "../modules/assistants/presentation/tenant-assistant.routes";
import { buildAdminAssistantRoutes } from "../modules/assistants/presentation/admin-assistant.routes";
import { buildTenantWorkspaceRoutes } from "../modules/tenants/presentation/tenant-workspace.routes";
import { buildAdminTenantRoutes } from "../modules/tenants/presentation/admin-tenant.routes";
import { buildTenantCampaignRoutes } from "../modules/campaigns/presentation/tenant-campaign.routes";
import { buildAdminCampaignRoutes } from "../modules/campaigns/presentation/admin-campaign.routes";
import { buildTenantLeadRoutes } from "../modules/leads/presentation/tenant-lead.routes";
import { buildAdminLeadRoutes } from "../modules/leads/presentation/admin-lead.routes";
import { buildTenantCallRoutes } from "../modules/calls/presentation/tenant-call.routes";
import { buildAdminCallRoutes } from "../modules/calls/presentation/admin-call.routes";
import { buildTenantDashboardRoutes } from "../modules/dashboard/presentation/tenant-dashboard.routes";
import { buildAdminDashboardRoutes } from "../modules/dashboard/presentation/admin-dashboard.routes";
import { buildTenantUserRoutes } from "../modules/users/presentation/tenant-user.routes";
import { buildWebhookRoutes } from "../modules/webhooks/presentation/webhook.routes";
import { buildAdminBatchRoutes } from "../modules/batches/presentation/admin-batch.routes";
import { buildAdminPlanRoutes } from "../modules/plans/presentation/admin-plan.routes";
import { buildTenantPlanRoutes } from "../modules/plans/presentation/tenant-plan.routes";
import { buildAdminBolnaApiKeyRoutes } from "../modules/bolna-api-keys/presentation/admin-bolna-api-key.routes";
import { buildRazorpayWebhookRoutes } from "../modules/payments/presentation/razorpay-webhook.routes";
import { buildTenantPaymentRoutes } from "../modules/payments/presentation/tenant-payment.routes";
import { buildTenantWalletRoutes } from "../modules/wallet/presentation/tenant-wallet.routes";
import {
  buildAdminInviteRoutes,
  buildPublicInviteRoutes,
} from "../modules/invites/presentation/invite.routes";
import { buildAdminWalletRoutes } from "../modules/wallet/presentation/admin-wallet.routes";
import { buildAdminPaymentRoutes } from "../modules/payments/presentation/admin-payment.routes";
import { buildAdminUserRoutes } from "../modules/users/presentation/admin-user.routes";
import { buildAdminPlatformAgentRoutes } from "../modules/platform-agents/presentation/admin-platform-agent.routes";
import { buildAdminExtractionRoutes } from "../modules/extractions/presentation/admin-extraction.routes";
import { buildAdminIndustryPackRoutes } from "../modules/industry-packs/presentation/admin-industry-pack.routes";

export function buildRoutes(c: AppContainer): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "OK",
      service: "Lead Qualification API",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });


  // ── Tenant API v1 (Scoped workspace actions) ─────────────────────────────
  router.use(
    "/v1/auth",
    buildTenantAuthRoutes(c.auth.tenantController, c.authenticate, c.authorize),
  );

  router.use(
    "/v1/auth/owner-invites",
    buildPublicInviteRoutes(c.invites.publicController),
  );

  router.use(
    "/v1/assistants",
    buildTenantAssistantRoutes(c.assistants.tenantController, c.authenticate),
  );
  router.use(
    "/v1/campaigns",
    buildTenantCampaignRoutes(
      c.campaigns.tenantController,
      c.batches.tenantController,
      c.authenticate,
      c.authorize,
    ),
  );
  router.use(
    "/v1/leads",
    buildTenantLeadRoutes(c.leads.tenantController, c.authenticate),
  );
  router.use(
    "/v1/calls",
    buildTenantCallRoutes(c.calls.tenantController, c.authenticate),
  );
  router.use(
    "/v1/dashboard",
    buildTenantDashboardRoutes(c.dashboard.tenantController, c.authenticate),
  );
  router.use(
    "/v1/users",
    buildTenantUserRoutes(
      c.users.tenantController,
      c.authenticate,
      c.authorize,
    ),
  );
  router.use(
    "/v1/tenants",
    buildTenantWorkspaceRoutes(
      c.tenants.workspaceController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/plans",
    buildTenantPlanRoutes(c.plans.tenantController, c.authenticate),
  );

  router.use(
    "/v1/wallet",
    buildTenantWalletRoutes(c.wallet.tenantController, c.authenticate),
  );

  router.use(
    "/v1/payments",
    buildTenantPaymentRoutes(c.payments.tenantController, c.authenticate),
  );

  // ── Admin API v1  ──────────────────────
  router.use(
    "/v1/admin/auth",
    buildAdminAuthRoutes(c.auth.adminController, c.authenticate),
  );
  router.use(
    "/v1/admin/invites",
    buildAdminInviteRoutes(
      c.invites.adminController,
      c.authenticate,
      c.authorize,
    ),
  );
  router.use(
    "/v1/admin/tenants",
    buildAdminTenantRoutes(
      c.tenants.adminController,
      c.authenticate,
      c.authorize,
    ),
  );
  router.use(
    "/v1/admin/assistants",
    buildAdminAssistantRoutes(
      c.assistants.adminController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/admin/platform-agents",
    buildAdminPlatformAgentRoutes(
      c.platformAgents.adminController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/admin/extractions",
    buildAdminExtractionRoutes(
      c.extractions.adminController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/admin/industry-packs",
    buildAdminIndustryPackRoutes(
      c.industryPacks.adminController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/admin/dashboard",
    buildAdminDashboardRoutes(
      c.dashboard.adminController,
      c.authenticate,
      c.authorize,
    ),
  );
  router.use(
    "/v1/admin/campaigns",
    buildAdminCampaignRoutes(
      c.campaigns.adminController,
      c.authenticate,
      c.authorize,
    ),
  );
  router.use(
    "/v1/admin/batches",
    buildAdminBatchRoutes(
      c.batches.adminController,
      c.authenticate,
      c.authorize,
    ),
  );
  router.use(
    "/v1/admin/leads",
    buildAdminLeadRoutes(c.leads.adminController, c.authenticate, c.authorize),
  );
  router.use(
    "/v1/admin/calls",
    buildAdminCallRoutes(c.calls.adminController, c.authenticate, c.authorize),
  );
  router.use(
    "/v1/admin/plans",
    buildAdminPlanRoutes(c.plans.adminController, c.authenticate, c.authorize),
  );
  router.use(
    "/v1/admin/bolna-keys",
    buildAdminBolnaApiKeyRoutes(
      c.bolnaApiKeys.adminController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/admin/wallet",
    buildAdminWalletRoutes(
      c.wallet.adminController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/admin/payments",
    buildAdminPaymentRoutes(
      c.payments.adminController,
      c.authenticate,
      c.authorize,
    ),
  );

  router.use(
    "/v1/admin/users",
    buildAdminUserRoutes(c.users.adminController, c.authenticate, c.authorize),
  );

  return router;
}
