import { describe, it, expect } from "vitest";
import { AesSarvamEncryptionService } from "../infrastructure/services/aes-sarvam-encryption.service";
import { SarvamEncryptionError } from "../domain/errors/sarvam-configuration.errors";

describe("AesSarvamEncryptionService", () => {
  const secret = "test-secret-32-chars-long-0123456789abcdef";
  const service = new AesSarvamEncryptionService(secret);

  it("should encrypt and decrypt a plaintext string successfully", () => {
    const original = "sk_live_sarvam_test_key_1234567890";
    const encrypted = service.encrypt(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted.split(":")).toHaveLength(3); // iv:tag:ciphertext

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should produce different ciphertexts for the same plaintext due to random IV", () => {
    const text = "constant_secret_string";
    const enc1 = service.encrypt(text);
    const enc2 = service.encrypt(text);

    expect(enc1).not.toBe(enc2);
    expect(service.decrypt(enc1)).toBe(text);
    expect(service.decrypt(enc2)).toBe(text);
  });

  it("should throw SarvamEncryptionError when decrypting corrupted ciphertext", () => {
    const original = "sk_live_secret_key";
    const encrypted = service.encrypt(original);
    const [iv, tag, ciphertext] = encrypted.split(":");

    // Corrupt ciphertext
    const corruptedCiphertext =
      ciphertext.slice(0, -2) + (ciphertext.endsWith("a") ? "b" : "a");
    const corruptedPayload = `${iv}:${tag}:${corruptedCiphertext}`;

    expect(() => service.decrypt(corruptedPayload)).toThrow(
      SarvamEncryptionError,
    );
  });

  it("should throw SarvamEncryptionError when auth tag is tampered", () => {
    const original = "sk_live_secret_key";
    const encrypted = service.encrypt(original);
    const [iv, tag, ciphertext] = encrypted.split(":");

    // Corrupt tag
    const corruptedTag = tag.slice(0, -2) + (tag.endsWith("f") ? "e" : "f");
    const corruptedPayload = `${iv}:${corruptedTag}:${ciphertext}`;

    expect(() => service.decrypt(corruptedPayload)).toThrow(
      SarvamEncryptionError,
    );
  });

  it("should throw SarvamEncryptionError on invalid format", () => {
    expect(() => service.decrypt("invalid-data")).toThrow(SarvamEncryptionError);
  });

  describe("maskKey", () => {
    it("should mask sk_ prefixed keys properly preserving prefix and last 4 chars", () => {
      const key = "sk_live_1234567890abcdef";
      const masked = service.maskKey(key);
      expect(masked).toBe("sk_••••••••cdef");
      expect(masked).not.toContain("1234567890");
    });

    it("should mask generic keys showing first 3 and last 4 chars", () => {
      const key = "sarvam_org_workspace_token_9999";
      const masked = service.maskKey(key);
      expect(masked).toBe("sar••••••••9999");
      expect(masked).not.toContain("workspace_token");
    });

    it("should handle short keys safely", () => {
      const key = "12345";
      const masked = service.maskKey(key);
      expect(masked).toBe("••••45");
    });

    it("should handle empty or null string safely", () => {
      expect(service.maskKey("")).toBe("••••••••");
    });
  });
});

