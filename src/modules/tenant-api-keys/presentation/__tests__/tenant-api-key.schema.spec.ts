import { describe, it, expect } from "vitest";
import {
  listTenantApiKeysQuerySchema,
  apiKeyParamSchema,
} from "../tenant-api-key.schema";

describe("TenantApiKey Schemas", () => {
  describe("listTenantApiKeysQuerySchema", () => {
    it("should provide default pagination values when omitted", () => {
      const result = listTenantApiKeysQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it("should coerce string numbers for page and limit", () => {
      const result = listTenantApiKeysQuerySchema.safeParse({
        page: "2",
        limit: "50",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
      }
    });

    it("should reject negative or zero page", () => {
      const result = listTenantApiKeysQuerySchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it("should reject limit exceeding 100", () => {
      const result = listTenantApiKeysQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });
  });

  describe("apiKeyParamSchema", () => {
    it("should accept valid UUID", () => {
      const result = apiKeyParamSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid non-UUID id", () => {
      const result = apiKeyParamSchema.safeParse({ id: "invalid-id-123" });
      expect(result.success).toBe(false);
    });
  });
});
