import { Router } from "express";
import type { QuickDialController } from "./quick-dial.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  initiateQuickDialSchema,
  initiateBatchQuickDialSchema,
  listQuickDialJobsQuerySchema,
} from "./quick-dial.schema";

export function buildQuickDialRoutes(
  controller: QuickDialController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.tenant());

  router.post("/", validate(initiateQuickDialSchema), controller.initiate);
  router.post("/batch", validate(initiateBatchQuickDialSchema), controller.initiateBatch);
  router.get("/", validateQuery(listQuickDialJobsQuerySchema), controller.list);
  router.get("/:id", controller.get);

  return router;
}

