import { describe, it, expect } from "vitest";
import { encryptKey, decryptKey } from "../../../src/shared/utils/encryption";

describe("AES-256-GCM Encryption Utilities (Module 1)", () => {
  it("encrypts and decrypts sensitive plain text correctly", () => {
    const originalKey = "bn-3f7ad6692bdf416ab41bf0733ed93481";
    const encrypted = encryptKey(originalKey);

    expect(encrypted).not.toBe(originalKey);
    expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = decryptKey(encrypted);
    expect(decrypted).toBe(originalKey);
  });

  it("produces distinct ciphertexts for identical plaintext due to random IV", () => {
    const key = "same-secret-key-12345";
    const enc1 = encryptKey(key);
    const enc2 = encryptKey(key);

    expect(enc1).not.toBe(enc2);
    expect(decryptKey(enc1)).toBe(key);
    expect(decryptKey(enc2)).toBe(key);
  });

  it("throws error when encrypted format is invalid", () => {
    expect(() => decryptKey("invalid-string")).toThrow(
      "Invalid encrypted data format",
    );
    expect(() => decryptKey("part1:part2")).toThrow(
      "Invalid encrypted data format",
    );
  });

  it("throws error when authentication tag is tampered with", () => {
    const original = "my-secret-credential";
    const encrypted = encryptKey(original);
    const [iv, authTag, ciphertext] = encrypted.split(":");

    // Tamper with auth tag (flip last character)
    const tamperedTag =
      authTag.slice(0, -1) + (authTag.slice(-1) === "a" ? "b" : "a");
    const tamperedPayload = `${iv}:${tamperedTag}:${ciphertext}`;

    expect(() => decryptKey(tamperedPayload)).toThrow();
  });

  it("throws error when ciphertext is tampered with", () => {
    const original = "my-secret-credential";
    const encrypted = encryptKey(original);
    const [iv, authTag, ciphertext] = encrypted.split(":");

    const tamperedCipher =
      ciphertext.slice(0, -1) + (ciphertext.slice(-1) === "a" ? "b" : "a");
    const tamperedPayload = `${iv}:${authTag}:${tamperedCipher}`;

    expect(() => decryptKey(tamperedPayload)).toThrow();
  });
});
