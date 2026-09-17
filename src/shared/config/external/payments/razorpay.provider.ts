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

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 300;

/**
 * Razorpay adapter — fail-fast on missing keys, timing-safe HMAC verify,
 * retries only on 5xx / network errors.
 */
export class RazorpayProvider implements IPaymentProvider {
  private readonly client: Razorpay;

  constructor() {
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

    const order = await this.withRetry(() =>
      this.client.orders.create(payload),
    );

    if (!order?.id) {
      throw new Error("Razorpay create-order response missing id.");
    }

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

    return this.timingSafeEqualHex(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!env.razorpay.webhookSecret || !signature) return false;

    const expected = crypto
      .createHmac("sha256", env.razorpay.webhookSecret)
      .update(rawBody)
      .digest("hex");

    return this.timingSafeEqualHex(expected, signature);
  }

  async getOrderPayments(orderId: string): Promise<OrderPayment[]> {
    const response = await this.withRetry(() =>
      this.client.orders.fetchPayments(orderId),
    );
    const items = response?.items ?? [];

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
