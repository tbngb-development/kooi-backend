import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import type Redis from "ioredis";
import type {
  PasswordResetTokenPayload,
  PasswordResetTokenService,
} from "../../application/interfaces/password-reset-token.service.interface";
import { env } from "../../../../shared/config/env";
import { InvalidResetTokenError } from "../../domain/errors/auth.errors";

export class JwtPasswordResetTokenService implements PasswordResetTokenService {
  constructor(private readonly redis: Redis) {}

  async generate(userId: string, email: string): Promise<string> {
    const payload: PasswordResetTokenPayload = {
      userId,
      email,
      type: "password-reset",
    };

    const options: SignOptions = {
      expiresIn: env.jwt.passwordResetExpiry as SignOptions["expiresIn"],
    };

    const token = jwt.sign(payload, env.jwt.secret, options);
    const tokenHash = this.hash(token);
    const ttlSeconds = this.parseExpiryToSeconds(env.jwt.passwordResetExpiry);

    // Whitelist token in Redis for single-use enforcement
    await this.redis.set(this.buildKey(tokenHash), userId, "EX", ttlSeconds);

    return token;
  }

  async verify(token: string): Promise<PasswordResetTokenPayload> {
    let payload: PasswordResetTokenPayload;
    try {
      payload = jwt.verify(token, env.jwt.secret) as PasswordResetTokenPayload;
    } catch {
      throw new InvalidResetTokenError();
    }

    if (payload.type !== "password-reset") {
      throw new InvalidResetTokenError();
    }

    const tokenHash = this.hash(token);
    const storedUserId = await this.redis.get(this.buildKey(tokenHash));

    if (!storedUserId || storedUserId !== payload.userId) {
      throw new InvalidResetTokenError();
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
    return `password-reset-token:${tokenHash}`;
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 600;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 600;
    }
  }
}
