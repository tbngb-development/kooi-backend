// modules/calls/presentation/tenant-outbound-call.routes.ts

import { Router } from "express";
import type { TenantOutboundCallController } from "./tenant-outbound-call.controller";
import type { TenantApiKeyAuthMiddleware } from "../../../shared/middleware/tenant-api-key-auth";
import { validate } from "../../../shared/middleware/validate";
import { outboundCallRateLimiter } from "../../../shared/middleware/rate-limiters";
import { initiateOutboundCallSchema } from "./outbound-call.schema";

export function buildTenantOutboundCallRoutes(
  controller: TenantOutboundCallController,
  apiKeyAuth: TenantApiKeyAuthMiddleware,
): Router {
  const router = Router();

  router.post(
    "/",
    apiKeyAuth.authenticate(),
    outboundCallRateLimiter,
    validate(initiateOutboundCallSchema),
    controller.initiate,
  );

  return router;
}
