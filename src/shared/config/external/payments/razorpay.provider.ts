import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../../env";
import type {
  IPaymentProvider,
  CreateOrderInput,
  CreateOrderResult,
  VerifyPaymentInput,
  OrderPayment,
} from "./payment-provider.interface";
import type { Logger } from "../../../logging/logger.interface";

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 300;

/**
 * Razorpay adapter — fail-fast on missing keys, timing-safe HMAC verify,
 * retries only on 5xx / network errors.
 */
export class RazorpayProvider implements IPaymentProvider {
  private readonly client: Razorpay;

  constructor(private readonly logger?: Logger) {
    if (!env.razorpay.keyId || !env.razorpay.keySecret) {
      throw new Error(
        "Razorpay is misconfigured. Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET environment variables.",
      );
    }
    this.client = new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    });
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!Number.isInteger(input.amountPaisa) || input.amountPaisa < 100) {
      throw new Error(
        "amountPaisa must be an integer >= 100 (smallest currency unit).",
      );
    }

    const receipt = input.receipt.slice(0, 40);
    const payload = {
      amount: input.amountPaisa,
      currency: input.currency ?? "INR",
      receipt,
      notes: input.notes,
    };

    this.logger?.debug("Creating Razorpay order", {
      action: "razorpay.create_order_start",
      amountPaisa: input.amountPaisa,
      receipt,
    });

    const order = await this.withRetry(() =>
      this.client.orders.create(payload),
    );

    if (!order?.id) {
      throw new Error("Razorpay create-order response missing id.");
    }

    this.logger?.info("Razorpay order created successfully", {
      action: "razorpay.create_order_success",
      orderId: order.id,
      amount: Number(order.amount),
    });

    return {
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      keyId: env.razorpay.keyId,
    };
  }

  verifySignature(input: VerifyPaymentInput): boolean {
    if (!input.orderId || !input.paymentId || !input.signature) return false;

    const body = `${input.orderId}|${input.paymentId}`;
    const expected = crypto
      .createHmac("sha256", env.razorpay.keySecret)
      .update(body)
      .digest("hex");

    const isValid = this.timingSafeEqualHex(expected, input.signature);

    if (!isValid) {
      this.logger?.warn("Razorpay payment signature mismatch", {
        action: "razorpay.verify_signature_failed",
        orderId: input.orderId,
        paymentId: input.paymentId,
      });
    }

    return isValid;
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!env.razorpay.webhookSecret || !signature) return false;

    const expected = crypto
      .createHmac("sha256", env.razorpay.webhookSecret)
      .update(rawBody)
      .digest("hex");

    const isValid = this.timingSafeEqualHex(expected, signature);

    if (!isValid) {
      this.logger?.warn("Razorpay webhook signature mismatch", {
        action: "razorpay.verify_webhook_signature_failed",
      });
    }

    return isValid;
  }

  async getOrderPayments(orderId: string): Promise<OrderPayment[]> {
    this.logger?.debug("Fetching payments for Razorpay order", {
      action: "razorpay.get_payments_start",
      orderId,
    });

    const response = await this.withRetry(() =>
      this.client.orders.fetchPayments(orderId),
    );
    const items = response?.items ?? [];

    this.logger?.info("Retrieved order payments", {
      action: "razorpay.get_payments_success",
      orderId,
      paymentCount: items.length,
    });

    return items.map((p: any) => ({
      id: p.id,
      status: p.status,
      amount: Number(p.amount),
      currency: p.currency,
      method: p.method ?? null,
      captured: Boolean(p.captured),
      createdAt: p.created_at,
    }));
  }

  // ── internals ────────────────────────────────────────────────────────

  private timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(a, "hex"),
        Buffer.from(b, "hex"),
      );
    } catch {
      return false;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const status: number | undefined = err?.statusCode ?? err?.status;
        const isRetryable = !status || status >= 500;

        this.logger?.warn("Razorpay API request error", {
          action: "razorpay.api_attempt_failed",
          attempt: attempt + 1,
          statusCode: status,
          isRetryable,
        });

        if (!isRetryable || attempt === MAX_RETRIES) {
          lastError = err;
          break;
        }
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw lastError;
  }
}
