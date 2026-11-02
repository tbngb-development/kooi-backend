import { Router } from "express";
import type { AdminSarvamConfigurationController } from "./admin-sarvam-configuration.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createSarvamConfigurationSchema,
  updateSarvamConfigurationSchema,
  listSarvamConfigurationsQuerySchema,
} from "./sarvam-configuration.schema";

export function buildAdminSarvamConfigurationRoutes(
  controller: AdminSarvamConfigurationController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get(
    "/",
    validateQuery(listSarvamConfigurationsQuerySchema),
    controller.list,
  );
  router.post(
    "/",
    validate(createSarvamConfigurationSchema),
    controller.create,
  );
  router.get("/:id", controller.getById);
  router.patch(
    "/:id",
    validate(updateSarvamConfigurationSchema),
    controller.update,
  );
  router.delete("/:id", controller.delete);

  return router;
}

