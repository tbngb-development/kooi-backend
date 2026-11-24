import { ValidationError } from "../../../../shared/errors/validation.error";
import type {
  SarvamRetryConfig,
  SarvamRetryOnConfig,
  SarvamCampaignRetryOverride,
  SarvamBaseRetryCondition,
  SarvamShortDurationRetryCondition,
  SarvamErrorRetryCondition,
} from "../types/sarvam-agent.types";

export const VALID_SARVAM_RETRY_CONDITIONS = [
  "busy",
  "failed",
  "no_answer",
  "short_duration",
  "provider_error",
  "internal_error",
] as const;

export type ValidSarvamRetryConditionKey =
  (typeof VALID_SARVAM_RETRY_CONDITIONS)[number];

export function buildDisabledSarvamRetryConfig(): SarvamRetryConfig {
  return {
    max_retries: 0,
    retry_on: {
      busy: { enabled: false },
      failed: { enabled: false },
      no_answer: { enabled: false },
      short_duration: { enabled: false, threshold_seconds: 30 },
      provider_error: {
        enabled: false,
        max_retries: 3,
        retry_interval_minutes: 5,
      },
      internal_error: {
        enabled: false,
        max_retries: 3,
        retry_interval_minutes: 5,
      },
    },
  };
}

export function validateSarvamRetryConfig(config: unknown): SarvamRetryConfig {
  if (config === undefined || config === null) {
    return { max_retries: 0 };
  }

  if (typeof config !== "object" || Array.isArray(config)) {
    throw new ValidationError([
      {
        field: "retryConfig",
        message: "retryConfig must be an object.",
      },
    ]);
  }

  const raw = config as Record<string, unknown>;
  const max_retries = raw.max_retries === undefined ? 0 : raw.max_retries;

  if (
    typeof max_retries !== "number" ||
    !Number.isInteger(max_retries) ||
    max_retries < 0 ||
    max_retries > 20
  ) {
    throw new ValidationError([
      {
        field: "retryConfig.max_retries",
        message: "max_retries must be an integer between 0 and 20.",
      },
    ]);
  }

  const result: SarvamRetryConfig = { max_retries };

  if (raw.retry_on !== undefined && raw.retry_on !== null) {
    if (typeof raw.retry_on !== "object" || Array.isArray(raw.retry_on)) {
      throw new ValidationError([
        {
          field: "retryConfig.retry_on",
          message: "retry_on must be an object containing valid retry conditions.",
        },
      ]);
    }

    const validatedRetryOn: SarvamRetryOnConfig = {};
    const validKeysSet = new Set<string>(VALID_SARVAM_RETRY_CONDITIONS);

    for (const [key, cond] of Object.entries(raw.retry_on)) {
      const trimmedKey = key.trim();
      if (!validKeysSet.has(trimmedKey)) {
        throw new ValidationError([
          {
            field: `retryConfig.retry_on.${key}`,
            message: `Unsupported retry condition '${key}'. Supported conditions are: ${VALID_SARVAM_RETRY_CONDITIONS.join(", ")}.`,
          },
        ]);
      }

      if (typeof cond !== "object" || cond === null || Array.isArray(cond)) {
        throw new ValidationError([
          {
            field: `retryConfig.retry_on.${key}`,
            message: "Retry condition must be a valid object.",
          },
        ]);
      }

      const condObj = cond as Record<string, unknown>;

      if (typeof condObj.enabled !== "boolean") {
        throw new ValidationError([
          {
            field: `retryConfig.retry_on.${key}.enabled`,
            message: "enabled is required and must be a boolean.",
          },
        ]);
      }

      if (
        trimmedKey === "busy" ||
        trimmedKey === "failed" ||
        trimmedKey === "no_answer"
      ) {
        const { enabled, ...extra } = condObj;
        if (Object.keys(extra).length > 0) {
          throw new ValidationError([
            {
              field: `retryConfig.retry_on.${key}`,
              message: `Condition '${key}' only accepts 'enabled' boolean property. Unrecognized properties: ${Object.keys(extra).join(", ")}.`,
            },
          ]);
        }
        validatedRetryOn[trimmedKey as "busy" | "failed" | "no_answer"] = {
          enabled,
        };
      } else if (trimmedKey === "short_duration") {
        const { enabled, threshold_seconds, ...extra } = condObj;
        if (Object.keys(extra).length > 0) {
          throw new ValidationError([
            {
              field: `retryConfig.retry_on.short_duration`,
              message: `short_duration only accepts 'enabled' and 'threshold_seconds'. Unrecognized properties: ${Object.keys(extra).join(", ")}.`,
            },
          ]);
        }

        let threshold = 30;
        if (threshold_seconds !== undefined && threshold_seconds !== null) {
          if (
            typeof threshold_seconds !== "number" ||
            !Number.isInteger(threshold_seconds) ||
            threshold_seconds < 1
          ) {
            throw new ValidationError([
              {
                field: `retryConfig.retry_on.short_duration.threshold_seconds`,
                message: "threshold_seconds must be a positive integer in seconds (>= 1).",
              },
            ]);
          }
          threshold = threshold_seconds;
        }

        validatedRetryOn.short_duration = {
          enabled,
          threshold_seconds: threshold,
        };
      } else if (
        trimmedKey === "provider_error" ||
        trimmedKey === "internal_error"
      ) {
        const { enabled, max_retries: errorRetries, retry_interval_minutes: errorInterval, ...extra } =
          condObj;
        if (Object.keys(extra).length > 0) {
          throw new ValidationError([
            {
              field: `retryConfig.retry_on.${key}`,
              message: `${key} only accepts 'enabled', 'max_retries', and 'retry_interval_minutes'. Unrecognized properties: ${Object.keys(extra).join(", ")}.`,
            },
          ]);
        }

        let retries = 3;
        if (errorRetries !== undefined && errorRetries !== null) {
          if (
            typeof errorRetries !== "number" ||
            !Number.isInteger(errorRetries) ||
            errorRetries < 1 ||
            errorRetries > 20
          ) {
            throw new ValidationError([
              {
                field: `retryConfig.retry_on.${key}.max_retries`,
                message: "max_retries for error retry must be an integer between 1 and 20.",
              },
            ]);
          }
          retries = errorRetries;
        }

        let interval = 5;
        if (errorInterval !== undefined && errorInterval !== null) {
          if (
            typeof errorInterval !== "number" ||
            !Number.isInteger(errorInterval) ||
            errorInterval < 5
          ) {
            throw new ValidationError([
              {
                field: `retryConfig.retry_on.${key}.retry_interval_minutes`,
                message: "retry_interval_minutes for error retry must be at least 5 minutes.",
              },
            ]);
          }
          interval = errorInterval;
        }

        validatedRetryOn[trimmedKey as "provider_error" | "internal_error"] = {
          enabled,
          max_retries: retries,
          retry_interval_minutes: interval,
        };
      }
    }

    result.retry_on = validatedRetryOn;
  }

  if (
    raw.retry_interval_minutes !== undefined &&
    raw.retry_interval_minutes !== null
  ) {
    if (typeof raw.retry_interval_minutes === "number") {
      if (
        !Number.isInteger(raw.retry_interval_minutes) ||
        raw.retry_interval_minutes < 1
      ) {
        throw new ValidationError([
          {
            field: "retryConfig.retry_interval_minutes",
            message: "retry_interval_minutes must be a positive integer (>= 1).",
          },
        ]);
      }
      result.retry_interval_minutes = raw.retry_interval_minutes;
    } else if (Array.isArray(raw.retry_interval_minutes)) {
      if (raw.retry_interval_minutes.length === 0) {
        result.retry_interval_minutes = [];
      } else {
        const cleanedIntervals: number[] = [];
        for (let i = 0; i < raw.retry_interval_minutes.length; i++) {
          const item = raw.retry_interval_minutes[i];
          if (typeof item !== "number" || !Number.isInteger(item) || item < 1) {
            throw new ValidationError([
              {
                field: `retryConfig.retry_interval_minutes[${i}]`,
                message: "Each retry interval must be a positive integer (>= 1).",
              },
            ]);
          }
          cleanedIntervals.push(item);
        }
        result.retry_interval_minutes = cleanedIntervals;
      }
    } else {
      throw new ValidationError([
        {
          field: "retryConfig.retry_interval_minutes",
          message:
            "retry_interval_minutes must be a positive integer or an array of positive integers.",
        },
      ]);
    }
  }

  return result;
}

/**
 * Sanitizes retry configuration for the external Sarvam API.
 * Sarvam's API schema (Pydantic Union[int, list[int]]) strictly rejects null values
 * for retry_interval_minutes with HTTP 422 Invalid Parameter.
 * Unset or disabled retry intervals must be omitted entirely from the external payload.
 */
export function sanitizeSarvamRetryConfigForProvider(
  config: SarvamRetryConfig,
): SarvamRetryConfig {
  const result: SarvamRetryConfig = {
    max_retries:
      typeof config.max_retries === "number" && Number.isInteger(config.max_retries)
        ? Math.max(0, Math.min(20, config.max_retries))
        : 0,
  };

  if (
    typeof config.retry_interval_minutes === "number" &&
    Number.isInteger(config.retry_interval_minutes) &&
    config.retry_interval_minutes >= 1
  ) {
    result.retry_interval_minutes = config.retry_interval_minutes;
  } else if (
    Array.isArray(config.retry_interval_minutes) &&
    config.retry_interval_minutes.length > 0
  ) {
    const validItems = config.retry_interval_minutes.filter(
      (item) => typeof item === "number" && Number.isInteger(item) && item >= 1,
    );
    if (validItems.length > 0) {
      result.retry_interval_minutes = validItems;
    }
  }

  if (config.retry_on && typeof config.retry_on === "object") {
    const cleanedRetryOn: SarvamRetryOnConfig = {};
    for (const [key, cond] of Object.entries(config.retry_on)) {
      if (cond && typeof cond === "object" && typeof cond.enabled === "boolean") {
        cleanedRetryOn[key as keyof SarvamRetryOnConfig] = cond as any;
      }
    }
    if (Object.keys(cleanedRetryOn).length > 0) {
      result.retry_on = cleanedRetryOn;
    }
  }

  return result;
}

/**
 * Resolves final persisted campaign retry configuration and external Sarvam API payload.
 * Strictly respects plan entitlements (activePlan.retryAutomation).
 */
export function resolveSarvamCampaignRetry(
  agentConfig: SarvamRetryConfig,
  tenantOverride: SarvamCampaignRetryOverride | undefined,
  planAllowsRetry: boolean,
): {
  persistedConfig: SarvamCampaignRetryOverride;
  providerConfig: SarvamRetryConfig;
} {
  // If plan does NOT permit retry automation:
  // Forced to OFF state (max_retries: 0, all conditions disabled)
  if (!planAllowsRetry) {
    const disabled = buildDisabledSarvamRetryConfig();
    return {
      persistedConfig: {
        enabled: false,
        max_retries: 0,
        retry_interval_minutes: null,
        retry_on: disabled.retry_on ?? null,
      },
      providerConfig: sanitizeSarvamRetryConfigForProvider(disabled),
    };
  }

  // Plan allows retry automation:
  // If tenant explicitly toggled OFF (enabled === false):
  if (tenantOverride && tenantOverride.enabled === false) {
    const disabled = buildDisabledSarvamRetryConfig();
    return {
      persistedConfig: {
        enabled: false,
        max_retries: 0,
        retry_interval_minutes: null,
        retry_on: disabled.retry_on ?? null,
      },
      providerConfig: sanitizeSarvamRetryConfigForProvider(disabled),
    };
  }

  // If tenant explicitly provided customizations (enabled === true):
  if (tenantOverride && tenantOverride.enabled === true) {
    const validated = validateSarvamRetryConfig(tenantOverride);
    const persisted: SarvamCampaignRetryOverride = {
      enabled: true,
      max_retries: validated.max_retries,
      retry_interval_minutes: validated.retry_interval_minutes ?? null,
      retry_on: validated.retry_on ?? null,
    };
    return {
      persistedConfig: persisted,
      providerConfig: sanitizeSarvamRetryConfigForProvider(validated),
    };
  }

  // Tenant provided no override: inherit from Sarvam Agent
  const validatedAgent = validateSarvamRetryConfig(agentConfig);
  const isEnabledByDefault = validatedAgent.max_retries > 0;

  if (!isEnabledByDefault) {
    const disabled = buildDisabledSarvamRetryConfig();
    return {
      persistedConfig: {
        enabled: false,
        max_retries: 0,
        retry_interval_minutes: null,
        retry_on: disabled.retry_on ?? null,
      },
      providerConfig: sanitizeSarvamRetryConfigForProvider(disabled),
    };
  }

  return {
    persistedConfig: {
      enabled: true,
      max_retries: validatedAgent.max_retries,
      retry_interval_minutes: validatedAgent.retry_interval_minutes ?? null,
      retry_on: validatedAgent.retry_on ?? null,
    },
    providerConfig: sanitizeSarvamRetryConfigForProvider(validatedAgent),
  };
}

