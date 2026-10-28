import crypto from "crypto";

export interface GeneratedApiKey {
  keyIdentifier: string;
  secret: string;
  fullKey: string;
  secretHash: string;
}

export interface IApiKeyCryptoService {
  generateKey(): GeneratedApiKey;
  hashSecret(secret: string): string;
  verifySecret(providedSecret: string, storedHash: string): boolean;
}

export class ApiKeyCryptoService implements IApiKeyCryptoService {
  /**
   * Generates a new API key pair consisting of:
   *  - keyIdentifier: ki-<uuid>
   *  - secret: 32 random bytes encoded as hex with "sec_" prefix
   *  - fullKey: <keyIdentifier>.<secret>
   *  - secretHash: SHA-256 hex digest of secret
   */
  generateKey(): GeneratedApiKey {
    const keyIdentifier = `ki-${crypto.randomUUID()}`;
    const rawBytes = crypto.randomBytes(32).toString("hex");
    const secret = `sec_${rawBytes}`;
    const fullKey = `${keyIdentifier}.${secret}`;
    const secretHash = this.hashSecret(secret);

    return {
      keyIdentifier,
      secret,
      fullKey,
      secretHash,
    };
  }

  /**
   * Computes SHA-256 hash of the secret string.
   */
  hashSecret(secret: string): string {
    return crypto.createHash("sha256").update(secret).digest("hex");
  }

  /**
   * Verifies the secret against the stored hash in constant time.
   */
  verifySecret(providedSecret: string, storedHash: string): boolean {
    if (!providedSecret || !storedHash) {
      return false;
    }

    const computedHash = this.hashSecret(providedSecret);
    const computedBuffer = Buffer.from(computedHash, "utf8");
    const storedBuffer = Buffer.from(storedHash, "utf8");

    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, storedBuffer);
  }
}
