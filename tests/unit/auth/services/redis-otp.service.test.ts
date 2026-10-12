import { describe, it, expect, beforeEach } from "vitest";
import { RedisOtpService } from "../../../../src/modules/auth/infrastructure/services/redis-otp.service";
import { createRedisMock } from "../../../setup/redis-mock";

describe("RedisOtpService (Module 2)", () => {
  let redis: any;
  let otpService: RedisOtpService;

  beforeEach(() => {
    redis = createRedisMock();
    otpService = new RedisOtpService(redis);
  });

  it("generates a 6-digit numeric OTP and stores it", async () => {
    const otp = await otpService.generateAndStore("register", "user@example.com");

    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it("verifies correct OTP and consumes it (one-time use)", async () => {
    const email = "user@example.com";
    const otp = await otpService.generateAndStore("register", email);

    // First verification succeeds
    const result1 = await otpService.verify("register", email, otp);
    expect(result1.valid).toBe(true);

    // Second verification fails because OTP was deleted on success
    const result2 = await otpService.verify("register", email, otp);
    expect(result2.valid).toBe(false);
  });

  it("rejects invalid OTP and tracks remaining attempts", async () => {
    const email = "user@example.com";
    await otpService.generateAndStore("register", email);

    const result = await otpService.verify("register", email, "000000");
    expect(result.valid).toBe(false);
    expect(result.attemptsRemaining).toBe(2);
    expect(result.maxAttemptsExceeded).toBe(false);
  });

  it("locks out when max attempts exceeded", async () => {
    const email = "user@example.com";
    await otpService.generateAndStore("register", email);

    await otpService.verify("register", email, "111111"); // Attempt 1 (2 left)
    await otpService.verify("register", email, "222222"); // Attempt 2 (1 left)
    await otpService.verify("register", email, "333333"); // Attempt 3 (0 left)

    const fourthAttempt = await otpService.verify("register", email, "444444");
    expect(fourthAttempt.valid).toBe(false);
    expect(fourthAttempt.maxAttemptsExceeded).toBe(true);
  });

  it("invalidates OTP explicitly", async () => {
    const email = "user@example.com";
    const otp = await otpService.generateAndStore("register", email);

    await otpService.invalidate("register", email);

    const result = await otpService.verify("register", email, otp);
    expect(result.valid).toBe(false);
  });
});
