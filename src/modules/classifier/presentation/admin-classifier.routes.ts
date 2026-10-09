import { Router } from "express";
import type { AdminClassifierController } from "./admin-classifier.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createClassifierDispositionSchema,
  updateClassifierDispositionSchema,
  assignClassifierToAgentSchema,
  testClassifierSchema,
  listClassifierDispositionsQuerySchema,
  listClassifierResultsQuerySchema,
} from "./classifier.schema";

export function buildAdminClassifierRoutes(
  controller: AdminClassifierController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin(), authorize.platformAdmin());

  router.post(
    "/dispositions",
    validate(createClassifierDispositionSchema),
    controller.createDispositionHandler,
  );
  router.patch(
    "/dispositions/:id",
    validate(updateClassifierDispositionSchema),
    controller.updateDispositionHandler,
  );
  router.delete("/dispositions/:id", controller.deleteDispositionHandler);
  router.get(
    "/dispositions",
    validateQuery(listClassifierDispositionsQuerySchema),
    controller.listDispositionsHandler,
  );
  router.get("/dispositions/:id", controller.getDispositionHandler);

  // Agent assignment
  router.post(
    "/agents/:agentId/assign",
    validate(assignClassifierToAgentSchema),
    controller.assignToAgentHandler,
  );
  router.post(
    "/agents/:agentId/remove",
    validate(assignClassifierToAgentSchema),
    controller.removeFromAgentHandler,
  );
  router.get(
    "/agents/:agentId/dispositions",
    controller.listAgentClassifiersHandler,
  );

  // Test
  router.post(
    "/test",
    validate(testClassifierSchema),
    controller.testClassifierHandler,
  );

  // Results
  router.get(
    "/results",
    validateQuery(listClassifierResultsQuerySchema),
    controller.listCallResultsHandler,
  );
  router.get("/results/:callId", controller.getCallResultHandler);

  return router;
}
