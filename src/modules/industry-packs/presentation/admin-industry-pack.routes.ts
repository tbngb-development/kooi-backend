import { Router } from "express";
import type { AdminIndustryPackController } from "./admin-industry-pack.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createIndustryPackSchema,
  updateIndustryPackSchema,
  assignAgentSchema,
  listIndustryPacksQuerySchema,
} from "./industry-pack.schema";

export function buildAdminIndustryPackRoutes(
  controller: AdminIndustryPackController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.post("/", validate(createIndustryPackSchema), controller.create);
  router.get("/", validateQuery(listIndustryPacksQuerySchema), controller.list);
  router.get("/:id", controller.get);
  router.patch("/:id", validate(updateIndustryPackSchema), controller.update);
  router.delete("/:id", controller.remove);

  // Agent composition
  router.post("/:id/agents", validate(assignAgentSchema), controller.assignAgentHandler);
  router.delete("/agents/:agentId", controller.removeAgentHandler);

  return router;
}