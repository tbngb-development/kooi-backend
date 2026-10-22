import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import type Redis from "ioredis";
import type {
  EmailVerificationTokenPayload,
  EmailVerificationTokenService,
} from "../../application/interfaces/email-verification-token.service.interface";
import { env } from "../../../../shared/config/env";
import { InvalidVerificationTokenError } from "../../domain/errors/auth.errors";

const TOKEN_EXPIRY = "15m";
const TOKEN_TTL_SECONDS = 15 * 60; // 900 seconds

export class JwtEmailVerificationTokenService
  implements EmailVerificationTokenService
{
  constructor(private readonly redis: Redis) {}

  async generate(email: string): Promise<string> {
    const normalizedEmail = email.trim().toLowerCase();
    const payload: EmailVerificationTokenPayload = {
      email: normalizedEmail,
      type: "email-verification",
    };

    const options: SignOptions = {
      expiresIn: TOKEN_EXPIRY as SignOptions["expiresIn"],
    };

    const token = jwt.sign(payload, env.jwt.secret, options);
    const tokenHash = this.hash(token);

    // Whitelist token in Redis for single-use enforcement
    await this.redis.set(
      this.buildKey(tokenHash),
      normalizedEmail,
      "EX",
      TOKEN_TTL_SECONDS,
    );

    return token;
  }

  async verify(token: string): Promise<EmailVerificationTokenPayload> {
    let payload: EmailVerificationTokenPayload;
    try {
      payload = jwt.verify(
        token,
        env.jwt.secret,
      ) as EmailVerificationTokenPayload;
    } catch {
      throw new InvalidVerificationTokenError();
    }

    if (payload.type !== "email-verification") {
      throw new InvalidVerificationTokenError();
    }

    const tokenHash = this.hash(token);
    const storedEmail = await this.redis.get(this.buildKey(tokenHash));

    if (!storedEmail || storedEmail !== payload.email) {
      throw new InvalidVerificationTokenError();
    }

    return payload;
  }

  async invalidate(token: string): Promise<void> {
    const tokenHash = this.hash(token);
    await this.redis.del(this.buildKey(tokenHash));
  }

  private hash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private buildKey(tokenHash: string): string {
    return `email-verification-token:${tokenHash}`;
  }
}
