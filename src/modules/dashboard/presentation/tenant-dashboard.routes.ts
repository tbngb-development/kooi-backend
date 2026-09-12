import { Router } from "express";
import type { TenantDashboardController } from "./tenant-dashboard.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";

export function buildTenantDashboardRoutes(
  controller: TenantDashboardController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  // ── KPI Cards ──
  router.get("/overview", controller.overview);

  // ── Time-Series Graphs ──
  router.get("/call-trends", controller.callTrends);
  router.get("/spend-trends", controller.spendTrends);

  // ── Funnel & Distributions ──
  router.get("/lead-funnel", controller.leadFunnel);
  router.get("/disposition-breakdown", controller.dispositionBreakdown);
  router.get("/temperature-distribution", controller.temperatureDistribution);

  // ── Campaign Analytics ──
  router.get("/top-campaigns", controller.topCampaigns);

  // ── Activity Feed ──
  router.get("/recent-activity", controller.recentActivity);

  return router;
}
