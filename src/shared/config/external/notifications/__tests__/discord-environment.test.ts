import { describe, expect, it } from "vitest";
import {
  APP_ENVIRONMENTS,
  isAppEnvironment,
  resolveAppEnvironment,
} from "../discord-environment";

describe("resolveAppEnvironment", () => {
  it("exposes the four labels accepted by the notification service", () => {
    expect(APP_ENVIRONMENTS).toEqual([
      "local-dev",
      "development",
      "staging",
      "production",
    ]);
  });

  it("prefers an explicit APP_ENV over NODE_ENV", () => {
    expect(resolveAppEnvironment("local-dev", "production")).toBe("local-dev");
  });

  it("falls back to NODE_ENV when APP_ENV is unset", () => {
    expect(resolveAppEnvironment(undefined, "staging")).toBe("staging");
    expect(resolveAppEnvironment(undefined, "production")).toBe("production");
  });

  it("defaults to development for unknown or missing values", () => {
    expect(resolveAppEnvironment(undefined, "test")).toBe("development");
    expect(resolveAppEnvironment(undefined, undefined)).toBe("development");
    expect(resolveAppEnvironment("  ", "development")).toBe("development");
  });

  it("rejects an invalid explicit APP_ENV", () => {
    expect(() => resolveAppEnvironment("qa", "production")).toThrow(
      /Invalid APP_ENV/,
    );
  });

  it("recognizes only supported labels", () => {
    expect(isAppEnvironment("staging")).toBe(true);
    expect(isAppEnvironment("STAGING")).toBe(false);
    expect(isAppEnvironment(undefined)).toBe(false);
  });
});
