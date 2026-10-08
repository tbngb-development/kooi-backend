import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 5001,
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: (process.env.NODE_ENV || "development") === "development",
  logLevel:
    process.env.LOG_LEVEL ||
    ((process.env.NODE_ENV || "development") === "development"
      ? "debug"
      : "info"),
  jwt: {
    secret: requireEnv("JWT_SECRET"),
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
    inviteExpiry: process.env.JWT_INVITE_EXPIRY || "7d",
    passwordResetExpiry: process.env.JWT_PASSWORD_RESET_EXPIRY || "10m",
  },

  database: {
    url: requireEnv("DATABASE_URL"),
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    prefix: process.env.REDIS_PREFIX || `{${process.env.nodeEnv}}`,
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || "http://localhost:3001").split(","),
  },

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3001",

  bolna: {
    apiUrl: process.env.BOLNA_API_URL || "https://api.bolna.ai",
    encryptionSecret: requireEnv("BOLNA_KEY_ENCRYPTION_SECRET"),
    bolnaInboundAuthToken: process.env.BOLNA_INBOUND_AUTH_TOKEN ?? "",
    testNumber: process.env.BOLNA_TEST_INBOUND_NUMBER ?? "",
  },

  webhook: {
    baseUrl: process.env.WEBHOOK_BASE_URL || "",
    webhookSecret: process.env.WEBHOOK_SECRET || "",
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "noreply@localhost",
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  },

  classifier: {
    // Provider: 'native' | 'ai-gateway'
    provider: (process.env.CLASSIFIER_PROVIDER || "native") as
      "native" | "ai-gateway",

    // Native TypeSafe API Key
    typesafeApiKey: process.env.TYPESAFE_API_KEY || "",
    typesafeBaseUrl: process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai",

    // Vercel AI Gateway (alternative)
    aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY || "",
    aiGatewayBaseUrl:
      process.env.AI_GATEWAY_BASE_URL ||
      "https://ai-gateway.vercel.sh/typesafe",

    model: process.env.CLASSIFIER_MODEL || "typesafe-ai/jev",
    maxTranscriptLength:
      Number(process.env.CLASSIFIER_MAX_TRANSCRIPT_LENGTH) || 8000,
  },

  skipCrossBatchDedup: process.env.SKIP_CROSS_BATCH_DEDUP === "true",
} as const;
