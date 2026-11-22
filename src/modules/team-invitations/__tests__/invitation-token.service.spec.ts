import { describe, it, expect } from "vitest";
import { InvitationTokenServiceImpl } from "../infrastructure/services/invitation-token.service";

describe("InvitationTokenServiceImpl", () => {
  const service = new InvitationTokenServiceImpl();

  describe("generate", () => {
    it("returns a 32-byte base64url token (43 URL-safe characters)", () => {
      const token = service.generate();

      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("generates a different token every time", () => {
      const tokens = new Set(Array.from({ length: 100 }, () => service.generate()));

      expect(tokens.size).toBe(100);
    });
  });

  describe("hash", () => {
    it("returns a deterministic SHA-256 hex digest", () => {
      const token = service.generate();

      const first = service.hash(token);
      const second = service.hash(token);

      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(first).toBe(second);
      expect(first).not.toBe(token);
    });

    it("returns different hashes for different tokens", () => {
      expect(service.hash(service.generate())).not.toBe(service.hash(service.generate()));
    });
  });

  describe("verify", () => {
    it("accepts the raw token that produced the hash", () => {
      const token = service.generate();

      expect(service.verify(token, service.hash(token))).toBe(true);
    });

    it("rejects a different token of the same length", () => {
      const token = service.generate();
      const other = service.generate();
      expect(other).not.toBe(token);

      expect(service.verify(other, service.hash(token))).toBe(false);
    });

    it("rejects a malformed stored hash without throwing", () => {
      expect(() => service.verify(service.generate(), "not-a-hash")).not.toThrow();
      expect(service.verify(service.generate(), "not-a-hash")).toBe(false);
    });

    it("rejects a mutated token", () => {
      const token = service.generate();
      const mutated = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

      expect(service.verify(mutated, service.hash(token))).toBe(false);
    });
  });
});
