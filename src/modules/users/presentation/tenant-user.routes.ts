import { Router } from "express";
import type { TenantUserController } from "./tenant-user.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import { createUserSchema, updateUserSchema } from "./user.schema";

export function buildTenantUserRoutes(
  controller: TenantUserController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());
  router.use(authorize.tenantRoles("OWNER", "ADMIN"));

  router.get("/", controller.list);
  router.post("/", validate(createUserSchema), controller.create);
  router.patch("/:id", validate(updateUserSchema), controller.updateHandler);
  router.delete("/:id", controller.deleteHandler);

  return router;
}
