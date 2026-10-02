import { Router } from "express";
import type { AdminBolnaApiKeyController } from "./admin-bolna-api-key.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import {
  createBolnaApiKeySchema,
  assignKeySchema,
} from "./bolna-api-key.schema";

export function buildAdminBolnaApiKeyRoutes(
  controller: AdminBolnaApiKeyController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get("/", controller.list);
  router.post("/", validate(createBolnaApiKeySchema), controller.create);
  router.post("/:id/assign", validate(assignKeySchema), controller.assign);
  router.post("/:id/deactivate", controller.deactivate); // No body needed

  return router;
}
