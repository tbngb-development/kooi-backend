import { describe, it, expect, beforeEach } from "vitest";
import { JwtPasswordResetTokenService } from "../../../../src/modules/auth/infrastructure/services/jwt-password-reset-token.service";
import { InvalidResetTokenError } from "../../../../src/modules/auth/domain/errors/auth.errors";
import { createRedisMock } from "../../../setup/redis-mock";

describe("JwtPasswordResetTokenService (Module 2)", () => {
  let redis: any;
  let service: JwtPasswordResetTokenService;

  beforeEach(() => {
    redis = createRedisMock();
    service = new JwtPasswordResetTokenService(redis);
  });

  it("generates and verifies valid password reset token", async () => {
    const userId = "user-123";
    const email = "user@company.com";

    const token = await service.generate(userId, email);
    expect(typeof token).toBe("string");

    const payload = await service.verify(token);
    expect(payload.userId).toBe(userId);
    expect(payload.email).toBe(email);
    expect(payload.type).toBe("password-reset");
  });

  it("invalidates token so it cannot be used a second time", async () => {
    const token = await service.generate("user-123", "user@company.com");

    await service.invalidate(token);

    await expect(service.verify(token)).rejects.toThrow(InvalidResetTokenError);
  });

  it("rejects forged or tampered token", async () => {
    const token = await service.generate("user-123", "user@company.com");
    const tampered = token.slice(0, -6) + "123456";

    await expect(service.verify(tampered)).rejects.toThrow(
      InvalidResetTokenError,
    );
  });
});
