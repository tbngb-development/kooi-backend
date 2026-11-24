import { describe, expect, it } from "vitest";
import {
  isIndianPhone,
  isValidE164,
  normalizePhoneNumber,
} from "../phone.rules";

describe("phone rules", () => {
  it("rejects a valid foreign E.164 number as non-Indian", () => {
    expect(isIndianPhone("+6587792911")).toBe(false);
    expect(isValidE164("+6587792911")).toBe(true);
  });

  it("keeps supported Indian formats", () => {
    expect(normalizePhoneNumber("9876543210")).toBe("+919876543210");
    expect(isIndianPhone("9876543210")).toBe(true);
    expect(isIndianPhone("+919876543210")).toBe(true);
  });
});
