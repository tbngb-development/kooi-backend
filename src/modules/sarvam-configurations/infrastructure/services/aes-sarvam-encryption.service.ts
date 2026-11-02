import crypto from "crypto";
import type { ISarvamEncryptionService } from "../../application/interfaces/sarvam-encryption-service.interface";
import { SarvamEncryptionError } from "../../domain/errors/sarvam-configuration.errors";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class AesSarvamEncryptionService implements ISarvamEncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(secret: string) {
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
      throw new Error(
        "AesSarvamEncryptionService requires a non-empty encryption secret.",
      );
    }
    // Derive a 32-byte key using SHA-256 regardless of raw string length
    this.encryptionKey = crypto.createHash("sha256").update(secret).digest();
  }

  encrypt(plaintext: string): string {
    if (!plaintext || typeof plaintext !== "string") {
      throw new SarvamEncryptionError("Cannot encrypt empty or invalid plaintext.");
    }

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

      let ciphertext = cipher.update(plaintext, "utf8", "hex");
      ciphertext += cipher.final("hex");

      const authTag = cipher.getAuthTag().toString("hex");
      return `${iv.toString("hex")}:${authTag}:${ciphertext}`;
    } catch (err) {
      throw new SarvamEncryptionError(
        err instanceof Error ? err.message : "Encryption failed.",
      );
    }
  }

  decrypt(encryptedData: string): string {
    if (!encryptedData || typeof encryptedData !== "string") {
      throw new SarvamEncryptionError("Invalid encrypted payload.");
    }

    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new SarvamEncryptionError("Invalid encrypted data format.");
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new SarvamEncryptionError("Invalid IV or authentication tag length.");
    }

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let plaintext = decipher.update(ciphertextHex, "hex", "utf8");
      plaintext += decipher.final("utf8");

      return plaintext;
    } catch {
      throw new SarvamEncryptionError(
        "Failed to authenticate and decrypt Sarvam credentials. The payload may be corrupted or tampered with.",
      );
    }
  }

  maskKey(apiKey: string): string {
    if (!apiKey) return "••••••••";
    const trimmed = apiKey.trim();
    if (trimmed.length <= 8) {
      return "••••" + trimmed.slice(-2);
    }

    // If starts with prefix like sk_ or sarvam_
    if (trimmed.startsWith("sk_")) {
      const suffix = trimmed.slice(-4);
      return `sk_••••••••${suffix}`;
    }

    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }
}

