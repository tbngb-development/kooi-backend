import { Router } from "express";
import type { TenantContactController } from "./tenant-contact.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { contactLimiter } from "../../../shared/middleware/rate-limiters";
import { validate } from "../../../shared/middleware/validate";
import {
  supportSubmissionSchema,
  bugReportSubmissionSchema,
  salesSubmissionSchema,
  tenantContactSchema,
} from "./contact.schema";

/**
 * Authenticated Tenant Contact Routes.
 * Mounted at: /api/v1/contact
 * Strictly requires active tenant session via authenticate.tenant().
 */
export function buildTenantContactRoutes(
  controller: TenantContactController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  // Strictly enforce tenant authentication
  router.use(authenticate.tenant());

  // Action-specific tenant routes
  router.post(
    "/support",
    contactLimiter,
    validate(supportSubmissionSchema),
    controller.submitSupport,
  );

  router.post(
    "/bug-report",
    contactLimiter,
    validate(bugReportSubmissionSchema),
    controller.submitBugReport,
  );

  router.post(
    "/sales",
    contactLimiter,
    validate(salesSubmissionSchema),
    controller.submitSales,
  );

  // General fallback
  router.post(
    "/",
    contactLimiter,
    validate(tenantContactSchema),
    controller.submit,
  );

  return router;
}
