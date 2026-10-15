import { Router } from "express";
import type { AdminPhoneNumberController } from "./admin-phone-number.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createPhoneNumberSchema,
  updatePhoneNumberSchema,
  assignPhoneNumberSchema,
  listPhoneNumbersQuerySchema,
} from "./phone-number.schema";

export function buildAdminPhoneNumberRoutes(
  controller: AdminPhoneNumberController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get("/", validateQuery(listPhoneNumbersQuerySchema), controller.list);
  router.post("/", validate(createPhoneNumberSchema), controller.create);
  router.get("/tenants/:tenantId/assistants", controller.getTenantAssistants);
  router.get("/:id", controller.get);
  router.put("/:id", validate(updatePhoneNumberSchema), controller.update);
  router.post(
    "/:id/assign",
    validate(assignPhoneNumberSchema),
    controller.assign,
  );
  router.post("/:id/unassign", controller.unassign);
  router.delete("/:id", controller.delete);

  return router;
}
