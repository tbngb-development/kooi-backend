import { Router } from "express";
import type { AdminInboundNumberController } from "./admin-inbound-number.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  importInboundNumbersSchema,
  createCustomInboundNumberSchema,
  assignInboundNumberSchema,
  suspendInboundNumberSchema,
  listInboundNumbersQuerySchema,
} from "./inbound-number.schema";

export function buildAdminInboundNumberRoutes(
  controller: AdminInboundNumberController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // GET / — query-string validation
  router.get("/", validateQuery(listInboundNumbersQuerySchema), controller.list);

  // POST /import — optional body
  router.post(
    "/import",
    validate(importInboundNumbersSchema),
    controller.importNumbers,
  );

  // POST /custom — add custom/third-party number (e.g. Vobiz)
  router.post(
    "/custom",
    validate(createCustomInboundNumberSchema),
    controller.createCustom,
  );

  // POST /bill-rentals — no body
  router.post("/bill-rentals", controller.billRentals);

  // GET /:id
  router.get("/:id", controller.get);

  // POST /:id/assign
  router.post(
    "/:id/assign",
    validate(assignInboundNumberSchema),
    controller.assign,
  );

  // POST /:id/suspend — optional body
  router.post(
    "/:id/suspend",
    validate(suspendInboundNumberSchema),
    controller.suspend,
  );

  router.post("/:id/reactivate", controller.reactivate);
  router.post("/:id/release", controller.release);
  router.post("/:id/retry-sync", controller.retrySync);

  return router;
}
