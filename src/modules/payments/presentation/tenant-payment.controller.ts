// src/modules/payments/presentation/tenant-payment.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { getTenantContext } from "../../../shared/utils/tenant-context";
import { param } from "../../../shared/utils/paramHelper";
import type { CreateOrderUseCase } from "../application/use-cases/create-order.use-case";
import type { CreateOnboardingOrderUseCase } from "../application/use-cases/create-onboarding-order.use-case";
import type { VerifyPaymentUseCase } from "../application/use-cases/verify-payment.use-case";
import type { GetOrderStatusUseCase } from "../application/use-cases/get-order-status.use-case";
import type { CreatePlanUpgradeOrderUseCase } from "../application/use-cases/create-plan-upgrade-order.use-case";
import type { VerifyPaymentInput } from "../application/dto/payment.dto";
import { AppError } from "../../../shared/errors";

export class TenantPaymentController {
  constructor(
    private readonly createTopupOrder: CreateOrderUseCase,
    private readonly createOnboardingOrder: CreateOnboardingOrderUseCase,
    private readonly createPlanUpgradeOrder: CreatePlanUpgradeOrderUseCase,
    private readonly verifyPaymentUseCase: VerifyPaymentUseCase,
    private readonly getOrderStatusUseCase: GetOrderStatusUseCase,
  ) {}

  createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = getTenantContext(req);
      const { purpose, amountPaisa, newPlanId } = req.body;

      switch (purpose) {
        case "PLAN_UPGRADE": {
          if (!newPlanId) {
            throw new AppError(
              HttpStatus.UNPROCESSABLE_ENTITY,
              "newPlanId is required for PLAN_UPGRADE",
              "MISSING_NEW_PLAN_ID",
            );
          }
          const result = await this.createPlanUpgradeOrder.execute({
            tenantId,
            newPlanId,
          });
          sendSuccess(res, result, HttpStatus.CREATED);
          break;
        }

        case "ONBOARDING": {
          const result = await this.createOnboardingOrder.execute(tenantId);
          sendSuccess(res, result, HttpStatus.CREATED);
          break;
        }

        case "WALLET_TOPUP": {
          const result = await this.createTopupOrder.execute({
            tenantId,
            amountPaisa: amountPaisa!,
          });
          sendSuccess(res, result, HttpStatus.CREATED);
          break;
        }

        default:
          throw new AppError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            `Unknown purpose: ${purpose}`,
            "UNKNOWN_PURPOSE",
          );
      }
    } catch (err) {
      next(err);
    }
  };

  verify = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.verifyPaymentUseCase.execute(
        req.body as VerifyPaymentInput,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  orderStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.getOrderStatusUseCase.execute(
        param(req, "orderId"),
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
