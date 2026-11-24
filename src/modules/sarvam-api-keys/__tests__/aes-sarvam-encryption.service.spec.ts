import { describe, it, expect } from "vitest";
import { AesSarvamEncryptionService } from "../infrastructure/services/aes-sarvam-encryption.service";
import { SarvamApiKeyEncryptionError } from "../domain/errors/sarvam-api-key.errors";

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

  it("should throw SarvamApiKeyEncryptionError when decrypting corrupted ciphertext", () => {
    const original = "sk_live_secret_key";
    const encrypted = service.encrypt(original);
    const [iv, tag, ciphertext] = encrypted.split(":");

    // Corrupt ciphertext
    const corruptedCiphertext =
      ciphertext.slice(0, -2) + (ciphertext.endsWith("a") ? "b" : "a");
    const corruptedPayload = `${iv}:${tag}:${corruptedCiphertext}`;

    expect(() => service.decrypt(corruptedPayload)).toThrow(
      SarvamApiKeyEncryptionError,
    );
  });

  it("should throw SarvamApiKeyEncryptionError when auth tag is tampered", () => {
    const original = "sk_live_secret_key";
    const encrypted = service.encrypt(original);
    const [iv, tag, ciphertext] = encrypted.split(":");

    // Corrupt tag
    const corruptedTag =
      tag.slice(0, -2) + (tag.endsWith("a") ? "b" : "a");
    const corruptedPayload = `${iv}:${corruptedTag}:${ciphertext}`;

    expect(() => service.decrypt(corruptedPayload)).toThrow(
      SarvamApiKeyEncryptionError,
    );
  });

  it("should throw SarvamApiKeyEncryptionError when payload format is invalid", () => {
    expect(() => service.decrypt("invalid-single-string")).toThrow(
      SarvamApiKeyEncryptionError,
    );
    expect(() => service.decrypt("iv:ciphertext_missing_tag")).toThrow(
      SarvamApiKeyEncryptionError,
    );
  });

  it("should mask key correctly leaving last characters visible", () => {
    expect(service.maskKey("sk_live_1234567890abcdef")).toBe("sk_••••••••cdef");
    expect(service.maskKey("short123")).toBe("••••23");
    expect(service.maskKey("tiny")).toBe("••••ny");
  });

  it("should throw SarvamApiKeyEncryptionError on empty secret in constructor", () => {
    expect(() => new AesSarvamEncryptionService("")).toThrow(
      SarvamApiKeyEncryptionError,
    );
  });
});
