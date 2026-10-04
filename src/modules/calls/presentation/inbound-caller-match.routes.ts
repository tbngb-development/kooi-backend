import { Router } from "express";
import type { InboundCallerMatchController } from "./inbound-caller-match.controller";
import { verifyBolnaInbound } from "../../../shared/middleware/verify-bolna-inbound";

export function buildInboundCallerMatchRoutes(
  controller: InboundCallerMatchController,
): Router {
  const router = Router();

  router.get("/caller-match", verifyBolnaInbound, controller.match);

  return router;
}
