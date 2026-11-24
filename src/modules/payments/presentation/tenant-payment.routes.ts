// src/modules/payments/presentation/tenant-payment.routes.ts
import { Router } from "express";
import type { TenantPaymentController } from "./tenant-payment.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createOrderSchema,
  verifyPaymentSchema,
  cancelPaymentSchema,
  listTenantPaymentsQuerySchema,
} from "./payment.schema";

export function buildTenantPaymentRoutes(
  controller: TenantPaymentController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  router.get(
    "/",
    validateQuery(listTenantPaymentsQuerySchema),
    controller.listHistory,
  );
  router.post(
    "/create-order",
    validate(createOrderSchema),
    controller.createOrder,
  );
  router.post("/verify", validate(verifyPaymentSchema), controller.verify);
  router.post("/cancel", validate(cancelPaymentSchema), controller.cancel);
  router.get("/order-status/:orderId", controller.orderStatus);
  router.get("/:id", controller.getDetail);

  return router;
}
