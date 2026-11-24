import { Router } from "express";
import multer from "multer";
import type { AdminSarvamAgentController } from "./admin-sarvam-agent.controller";
import type { AuthenticateMiddleware } from "../../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../../shared/middleware/validate";
import {
  createSarvamAgentSchema,
  updateSarvamAgentSchema,
  listSarvamAgentsQuerySchema,
} from "./admin-sarvam-agent.schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

export function buildAdminSarvamAgentRoutes(
  controller: AdminSarvamAgentController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get(
    "/",
    validateQuery(listSarvamAgentsQuerySchema),
    controller.list,
  );
  router.post("/", validate(createSarvamAgentSchema), controller.create);
  router.post("/upload-audio", upload.single("audio"), controller.uploadAudio);
  router.get("/:id", controller.getById);
  router.patch(
    "/:id",
    validate(updateSarvamAgentSchema),
    controller.update,
  );
  router.delete("/:id", controller.archive);

  return router;
}
