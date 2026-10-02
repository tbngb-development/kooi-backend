import { Router } from "express";
import type { AdminDashboardController } from "./admin-dashboard.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";

export function buildAdminDashboardRoutes(
  controller: AdminDashboardController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // ── Platform KPIs ──
  router.get("/overview", controller.overview);

  // ── Time-Series Graphs ──
  router.get("/revenue-trends", controller.revenueTrends);
  router.get("/call-volume-trends", controller.callVolumeTrends);

  // ── Distributions ──
  router.get("/tenant-distribution", controller.tenantDistribution);

  // ── Leaderboards ──
  router.get("/top-tenants", controller.topTenants);

  return router;
}
