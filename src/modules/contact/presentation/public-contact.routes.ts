import { Router } from "express";
import type { PublicContactController } from "./public-contact.controller";
import { contactLimiter } from "../../../shared/middleware/rate-limiters";
import { validate } from "../../../shared/middleware/validate";
import {
  demoSubmissionSchema,
  salesSubmissionSchema,
  supportSubmissionSchema,
  bugReportSubmissionSchema,
  publicContactSchema,
} from "./contact.schema";

/**
 * Public Contact Routes.
 * Mounted at: /api/v1/public/contact
 * Unauthenticated by design. Strictly rate limited (5 req / 15m).
 */
export function buildPublicContactRoutes(
  controller: PublicContactController,
): Router {
  const router = Router();

  // Action-specific public routes
  router.post(
    "/demo",
    contactLimiter,
    validate(demoSubmissionSchema),
    controller.submitDemo,
  );

  router.post(
    "/sales",
    contactLimiter,
    validate(salesSubmissionSchema),
    controller.submitSales,
  );

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

  // General fallback
  router.post(
    "/",
    contactLimiter,
    validate(publicContactSchema),
    controller.submit,
  );

  return router;
}
