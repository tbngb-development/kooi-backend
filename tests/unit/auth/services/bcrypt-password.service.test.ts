import { describe, it, expect } from "vitest";
import { BcryptPasswordService } from "../../../../src/modules/auth/infrastructure/services/bcrypt-password.service";

describe("BcryptPasswordService (Module 2)", () => {
  const passwordService = new BcryptPasswordService();

  it("hashes password and verifies matching password", async () => {
    const rawPassword = "StrongPassword@123";
    const hash = await passwordService.hash(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith("$2")).toBe(true);

    const isMatch = await passwordService.compare(rawPassword, hash);
    expect(isMatch).toBe(true);
  });

  it("rejects incorrect password against hash", async () => {
    const rawPassword = "CorrectPassword@123";
    const hash = await passwordService.hash(rawPassword);

    const isMatch = await passwordService.compare("WrongPassword@999", hash);
    expect(isMatch).toBe(false);
  });

  it("produces distinct hashes for identical passwords due to salt", async () => {
    const rawPassword = "RepeatedPassword@123";
    const hash1 = await passwordService.hash(rawPassword);
    const hash2 = await passwordService.hash(rawPassword);

    expect(hash1).not.toBe(hash2);
    expect(await passwordService.compare(rawPassword, hash1)).toBe(true);
    expect(await passwordService.compare(rawPassword, hash2)).toBe(true);
  });
});
