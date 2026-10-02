import crypto from "crypto";
import type Redis from "ioredis";
import type {
  OtpService,
  OtpVerificationResult,
} from "../../application/interfaces/otp-service.interface";

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const MAX_ATTEMPTS = 3;
const OTP_LENGTH = 6;

export class RedisOtpService implements OtpService {
  constructor(private readonly redis: Redis) {}

  async generateAndStore(purpose: string, identifier: string): Promise<string> {
    const otp = this.generateNumericOtp(OTP_LENGTH);
    const otpHash = this.hashOtp(otp);

    const otpKey = this.buildOtpKey(purpose, identifier);
    const attemptsKey = this.buildAttemptsKey(purpose, identifier);

    // Store OTP hash + reset attempts atomically
    await this.redis
      .multi()
      .set(otpKey, otpHash, "EX", OTP_TTL_SECONDS)
      .del(attemptsKey)
      .exec();

    return otp;
  }

  async verify(
    purpose: string,
    identifier: string,
    otp: string,
  ): Promise<OtpVerificationResult> {
    const otpKey = this.buildOtpKey(purpose, identifier);
    const attemptsKey = this.buildAttemptsKey(purpose, identifier);

    const storedHash = await this.redis.get(otpKey);

    if (!storedHash) {
      return {
        valid: false,
        attemptsRemaining: 0,
        maxAttemptsExceeded: false,
      };
    }

    // Check current attempts count
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      // First attempt for this OTP — align TTL with OTP TTL
      await this.redis.expire(attemptsKey, OTP_TTL_SECONDS);
    }

    if (attempts > MAX_ATTEMPTS) {
      // Invalidate OTP on exceeding attempts
      await this.redis.del(otpKey);
      return {
        valid: false,
        attemptsRemaining: 0,
        maxAttemptsExceeded: true,
      };
    }

    const incomingHash = this.hashOtp(otp);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(storedHash, "hex"),
      Buffer.from(incomingHash, "hex"),
    );

    if (!isValid) {
      return {
        valid: false,
        attemptsRemaining: MAX_ATTEMPTS - attempts,
        maxAttemptsExceeded: false,
      };
    }

    // Success — invalidate OTP to prevent reuse
    await this.redis.multi().del(otpKey).del(attemptsKey).exec();

    return {
      valid: true,
      attemptsRemaining: MAX_ATTEMPTS - attempts,
      maxAttemptsExceeded: false,
    };
  }

  async invalidate(purpose: string, identifier: string): Promise<void> {
    const otpKey = this.buildOtpKey(purpose, identifier);
    const attemptsKey = this.buildAttemptsKey(purpose, identifier);
    await this.redis.multi().del(otpKey).del(attemptsKey).exec();
  }

  private generateNumericOtp(length: number): string {
    const max = 10 ** length;
    const num = crypto.randomInt(0, max);
    return num.toString().padStart(length, "0");
  }

  private hashOtp(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
  }

  private buildOtpKey(purpose: string, identifier: string): string {
    return `otp:${purpose}:${identifier.toLowerCase()}`;
  }

  private buildAttemptsKey(purpose: string, identifier: string): string {
    return `otp:${purpose}:${identifier.toLowerCase()}:attempts`;
  }
}
