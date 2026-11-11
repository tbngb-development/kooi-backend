import { describe, it, expect } from "vitest";
import {
  validateSarvamRetryConfig,
  buildDisabledSarvamRetryConfig,
  resolveSarvamCampaignRetry,
  VALID_SARVAM_RETRY_CONDITIONS,
} from "../domain/rules/sarvam-retry-config.rules";
import { ValidationError } from "../../../shared/errors/validation.error";

describe("Sarvam Retry Config Domain Rules", () => {
  describe("validateSarvamRetryConfig", () => {
    it("returns max_retries: 0 when input is null or undefined", () => {
      expect(validateSarvamRetryConfig(null)).toEqual({ max_retries: 0 });
      expect(validateSarvamRetryConfig(undefined)).toEqual({ max_retries: 0 });
    });

    it("throws ValidationError when input is not an object", () => {
      expect(() => validateSarvamRetryConfig("invalid")).toThrow(ValidationError);
      expect(() => validateSarvamRetryConfig([1, 2, 3])).toThrow(ValidationError);
    });

    it("validates max_retries bounds (0..20)", () => {
      expect(validateSarvamRetryConfig({ max_retries: 0 })).toEqual({ max_retries: 0 });
      expect(validateSarvamRetryConfig({ max_retries: 20 })).toEqual({ max_retries: 20 });

      expect(() => validateSarvamRetryConfig({ max_retries: -1 })).toThrow(ValidationError);
      expect(() => validateSarvamRetryConfig({ max_retries: 21 })).toThrow(ValidationError);
      expect(() => validateSarvamRetryConfig({ max_retries: 2.5 })).toThrow(ValidationError);
      expect(() => validateSarvamRetryConfig({ max_retries: "3" as any })).toThrow(ValidationError);
    });

    it("rejects unsupported retry condition names", () => {
      const unsupported = ["voicemail", "call_failed", "network_error", "hangup", "busy_signal"];
      for (const key of unsupported) {
        expect(() =>
          validateSarvamRetryConfig({
            max_retries: 3,
            retry_on: { [key]: { enabled: true } },
          }),
        ).toThrow(ValidationError);
      }
    });

    it("validates base conditions (busy, failed, no_answer) strictly", () => {
      const baseKeys = ["busy", "failed", "no_answer"] as const;
      for (const key of baseKeys) {
        const valid = validateSarvamRetryConfig({
          max_retries: 2,
          retry_on: { [key]: { enabled: true } },
        });
        expect(valid.retry_on?.[key]).toEqual({ enabled: true });

        // Extra properties must be rejected
        expect(() =>
          validateSarvamRetryConfig({
            max_retries: 2,
            retry_on: { [key]: { enabled: true, threshold_seconds: 30 } },
          }),
        ).toThrow(ValidationError);
      }
    });

    it("validates short_duration condition correctly", () => {
      const valid = validateSarvamRetryConfig({
        max_retries: 3,
        retry_on: {
          short_duration: { enabled: true, threshold_seconds: 25 },
        },
      });
      expect(valid.retry_on?.short_duration).toEqual({
        enabled: true,
        threshold_seconds: 25,
      });

      // Default threshold_seconds to 30 when omitted
      const withDefault = validateSarvamRetryConfig({
        max_retries: 3,
        retry_on: {
          short_duration: { enabled: true },
        },
      });
      expect(withDefault.retry_on?.short_duration).toEqual({
        enabled: true,
        threshold_seconds: 30,
      });

      // Reject non-positive or non-integer threshold_seconds
      expect(() =>
        validateSarvamRetryConfig({
          max_retries: 3,
          retry_on: {
            short_duration: { enabled: true, threshold_seconds: 0 },
          },
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateSarvamRetryConfig({
          max_retries: 3,
          retry_on: {
            short_duration: { enabled: true, threshold_seconds: -5 },
          },
        }),
      ).toThrow(ValidationError);
    });

    it("validates error conditions (provider_error, internal_error) correctly", () => {
      const errorKeys = ["provider_error", "internal_error"] as const;
      for (const key of errorKeys) {
        const valid = validateSarvamRetryConfig({
          max_retries: 3,
          retry_on: {
            [key]: {
              enabled: true,
              max_retries: 5,
              retry_interval_minutes: 10,
            },
          },
        });
        expect(valid.retry_on?.[key]).toEqual({
          enabled: true,
          max_retries: 5,
          retry_interval_minutes: 10,
        });

        // Default error retries to 3 and interval to 5 when omitted
        const withDefault = validateSarvamRetryConfig({
          max_retries: 3,
          retry_on: {
            [key]: { enabled: true },
          },
        });
        expect(withDefault.retry_on?.[key]).toEqual({
          enabled: true,
          max_retries: 3,
          retry_interval_minutes: 5,
        });

        // Reject retry_interval_minutes < 5
        expect(() =>
          validateSarvamRetryConfig({
            max_retries: 3,
            retry_on: {
              [key]: { enabled: true, retry_interval_minutes: 4 },
            },
          }),
        ).toThrow(ValidationError);

        // Reject max_retries < 1 or > 20
        expect(() =>
          validateSarvamRetryConfig({
            max_retries: 3,
            retry_on: {
              [key]: { enabled: true, max_retries: 0 },
            },
          }),
        ).toThrow(ValidationError);

        expect(() =>
          validateSarvamRetryConfig({
            max_retries: 3,
            retry_on: {
              [key]: { enabled: true, max_retries: 25 },
            },
          }),
        ).toThrow(ValidationError);
      }
    });

    it("validates global retry_interval_minutes (integer or array of integers)", () => {
      const single = validateSarvamRetryConfig({
        max_retries: 2,
        retry_interval_minutes: 15,
      });
      expect(single.retry_interval_minutes).toBe(15);

      const array = validateSarvamRetryConfig({
        max_retries: 3,
        retry_interval_minutes: [5, 10, 20],
      });
      expect(array.retry_interval_minutes).toEqual([5, 10, 20]);

      // Reject non-positive values
      expect(() =>
        validateSarvamRetryConfig({
          max_retries: 2,
          retry_interval_minutes: 0,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateSarvamRetryConfig({
          max_retries: 3,
          retry_interval_minutes: [5, -1, 10],
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("buildDisabledSarvamRetryConfig", () => {
    it("returns completely disabled retry configuration", () => {
      const disabled = buildDisabledSarvamRetryConfig();
      expect(disabled.max_retries).toBe(0);
      expect(disabled.retry_interval_minutes).toBeNull();
      expect(disabled.retry_on?.busy?.enabled).toBe(false);
      expect(disabled.retry_on?.failed?.enabled).toBe(false);
      expect(disabled.retry_on?.no_answer?.enabled).toBe(false);
      expect(disabled.retry_on?.short_duration?.enabled).toBe(false);
      expect(disabled.retry_on?.provider_error?.enabled).toBe(false);
      expect(disabled.retry_on?.internal_error?.enabled).toBe(false);
    });
  });

  describe("resolveSarvamCampaignRetry", () => {
    const activeAgentConfig = {
      max_retries: 3,
      retry_interval_minutes: 10,
      retry_on: {
        busy: { enabled: true },
        no_answer: { enabled: true },
        short_duration: { enabled: true, threshold_seconds: 30 },
        provider_error: { enabled: true, max_retries: 3, retry_interval_minutes: 5 },
        internal_error: { enabled: true, max_retries: 3, retry_interval_minutes: 5 },
      },
    };

    it("forces retries to OFF when plan does NOT allow retry automation", () => {
      const resolved = resolveSarvamCampaignRetry(
        activeAgentConfig,
        { enabled: true, max_retries: 5 },
        false, // planAllowsRetry
      );

      expect(resolved.persistedConfig.enabled).toBe(false);
      expect(resolved.persistedConfig.max_retries).toBe(0);
      expect(resolved.providerConfig.max_retries).toBe(0);
      expect(resolved.providerConfig.retry_on?.provider_error?.enabled).toBe(false);
      expect(resolved.providerConfig.retry_on?.internal_error?.enabled).toBe(false);
    });

    it("respects tenant toggle OFF (enabled: false)", () => {
      const resolved = resolveSarvamCampaignRetry(
        activeAgentConfig,
        { enabled: false },
        true, // planAllowsRetry
      );

      expect(resolved.persistedConfig.enabled).toBe(false);
      expect(resolved.persistedConfig.max_retries).toBe(0);
      expect(resolved.providerConfig.max_retries).toBe(0);
      expect(resolved.providerConfig.retry_on?.busy?.enabled).toBe(false);
    });

    it("inherits agent configuration when tenant provides no override and plan allows it", () => {
      const resolved = resolveSarvamCampaignRetry(
        activeAgentConfig,
        undefined,
        true, // planAllowsRetry
      );

      expect(resolved.persistedConfig.enabled).toBe(true);
      expect(resolved.persistedConfig.max_retries).toBe(3);
      expect(resolved.providerConfig.max_retries).toBe(3);
      expect(resolved.providerConfig.retry_interval_minutes).toBe(10);
      expect(resolved.providerConfig.retry_on?.busy?.enabled).toBe(true);
    });

    it("returns disabled config when agent itself has max_retries: 0 and tenant provides no override", () => {
      const resolved = resolveSarvamCampaignRetry(
        { max_retries: 0 },
        undefined,
        true,
      );

      expect(resolved.persistedConfig.enabled).toBe(false);
      expect(resolved.persistedConfig.max_retries).toBe(0);
      expect(resolved.providerConfig.max_retries).toBe(0);
    });

    it("applies tenant customizations when enabled: true", () => {
      const resolved = resolveSarvamCampaignRetry(
        activeAgentConfig,
        {
          enabled: true,
          max_retries: 5,
          retry_interval_minutes: [5, 15, 30],
          retry_on: {
            failed: { enabled: true },
          },
        },
        true,
      );

      expect(resolved.persistedConfig.enabled).toBe(true);
      expect(resolved.persistedConfig.max_retries).toBe(5);
      expect(resolved.persistedConfig.retry_interval_minutes).toEqual([5, 15, 30]);
      expect(resolved.providerConfig.max_retries).toBe(5);
      expect(resolved.providerConfig.retry_on?.failed?.enabled).toBe(true);
    });
  });
});

