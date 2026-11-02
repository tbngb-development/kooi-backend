import { Router } from "express";
import type { AdminSarvamApiKeyController } from "./admin-sarvam-api-key.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createSarvamApiKeySchema,
  updateSarvamApiKeySchema,
  listSarvamApiKeysQuerySchema,
} from "./sarvam-api-key.schema";

export function buildAdminSarvamApiKeyRoutes(
  controller: AdminSarvamApiKeyController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get(
    "/",
    validateQuery(listSarvamApiKeysQuerySchema),
    controller.list,
  );
  router.post("/", validate(createSarvamApiKeySchema), controller.create);
  router.get("/:id", controller.getById);
  router.patch(
    "/:id",
    validate(updateSarvamApiKeySchema),
    controller.update,
  );
  router.delete("/:id", controller.delete);

  return router;
}

