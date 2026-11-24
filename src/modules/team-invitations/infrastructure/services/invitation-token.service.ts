import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { InvitationTokenService } from "../../application/interfaces/invitation-token.service";

const TOKEN_BYTES = 32;
const HEX_DIGEST_LENGTH = 64;
const HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Generates a random 32-byte base64url token and stores only its SHA-256
 * digest. Verification uses timingSafeEqual to avoid timing leakage.
 */
export class InvitationTokenServiceImpl implements InvitationTokenService {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString("base64url");
  }

  hash(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  verify(rawToken: string, tokenHash: string): boolean {
    if (!HEX_PATTERN.test(tokenHash) || tokenHash.length !== HEX_DIGEST_LENGTH) {
      return false;
    }

    const expected = Buffer.from(this.hash(rawToken), "hex");
    const stored = Buffer.from(tokenHash, "hex");
    return expected.length === stored.length && timingSafeEqual(expected, stored);
  }
}
