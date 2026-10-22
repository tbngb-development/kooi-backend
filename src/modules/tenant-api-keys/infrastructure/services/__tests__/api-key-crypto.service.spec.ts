import { describe, it, expect } from "vitest";
import { ApiKeyCryptoService } from "../api-key-crypto.service";

describe("ApiKeyCryptoService", () => {
  const service = new ApiKeyCryptoService();

  describe("generateKey", () => {
    it("should generate a valid key pair with ki- prefix and 64-char hex secret", () => {
      const generated = service.generateKey();

      expect(generated.keyIdentifier).toMatch(
        /^ki-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(generated.secret).toMatch(/^sec_[0-9a-f]{64}$/i);
      expect(generated.fullKey).toBe(
        `${generated.keyIdentifier}.${generated.secret}`,
      );
      expect(generated.secretHash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it("should produce unique identifiers and secrets on consecutive calls", () => {
      const key1 = service.generateKey();
      const key2 = service.generateKey();

      expect(key1.keyIdentifier).not.toBe(key2.keyIdentifier);
      expect(key1.secret).not.toBe(key2.secret);
      expect(key1.fullKey).not.toBe(key2.fullKey);
      expect(key1.secretHash).not.toBe(key2.secretHash);
    });
  });

  describe("hashSecret and verifySecret", () => {
    it("should deterministically hash secret with SHA-256", () => {
      const secret = "sec_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const hash1 = service.hashSecret(secret);
      const hash2 = service.hashSecret(secret);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("should successfully verify matching secret against stored hash", () => {
      const { secret, secretHash } = service.generateKey();

      const isValid = service.verifySecret(secret, secretHash);
      expect(isValid).toBe(true);
    });

    it("should reject tampered secret", () => {
      const { secret, secretHash } = service.generateKey();
      const tamperedSecret = secret.slice(0, -1) + (secret.endsWith("a") ? "b" : "a");

      const isValid = service.verifySecret(tamperedSecret, secretHash);
      expect(isValid).toBe(false);
    });

    it("should reject empty or malformed secret", () => {
      const { secretHash } = service.generateKey();

      expect(service.verifySecret("", secretHash)).toBe(false);
      expect(service.verifySecret(null as unknown as string, secretHash)).toBe(false);
      expect(service.verifySecret(undefined as unknown as string, secretHash)).toBe(false);
      expect(service.verifySecret("short", secretHash)).toBe(false);
    });
  });
});
