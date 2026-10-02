export interface CreateOrderInput {
  amountPaisa: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface OrderPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  method: string | null;
  captured: boolean;
  createdAt: number;
}

export interface IPaymentProvider {
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifySignature(input: VerifyPaymentInput): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  getOrderPayments(orderId: string): Promise<OrderPayment[]>;
}
