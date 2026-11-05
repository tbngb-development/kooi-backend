import { ValidationError } from "../../../../shared/errors/validation.error";
import type {
  SarvamConnectionConfig,
  SarvamRetryConfig,
} from "../types/sarvam-agent.types";

export function validateConnectionConfigs(
  configs: unknown,
): SarvamConnectionConfig[] {
  if (!Array.isArray(configs) || configs.length === 0) {
    throw new ValidationError([
      {
        field: "connectionConfigs",
        message: "At least one telephony connection configuration is required.",
      },
    ]);
  }

  const cleaned: SarvamConnectionConfig[] = [];
  for (let i = 0; i < configs.length; i++) {
    const entry = configs[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}]`,
          message: "Connection configuration must be a valid object.",
        },
      ]);
    }

    const { connection_id, agent_phone_number, phone_numbers, ...extra } = entry as Record<
      string,
      unknown
    >;

    if (Object.keys(extra).length > 0) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}]`,
          message: "Unrecognized properties in connection configuration.",
        },
      ]);
    }

    if (typeof connection_id !== "string" || !connection_id.trim()) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}].connection_id`,
          message: "connection_id is required and cannot be empty.",
        },
      ]);
    }

    if (typeof agent_phone_number !== "string" || !agent_phone_number.trim()) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}].agent_phone_number`,
          message: "agent_phone_number is required and cannot be empty.",
        },
      ]);
    }

    const resolvedPhoneNumbers: string[] =
      Array.isArray(phone_numbers) && phone_numbers.length > 0
        ? phone_numbers.map((p) => String(p).trim()).filter(Boolean)
        : [agent_phone_number.trim()];

    cleaned.push({
      connection_id: connection_id.trim(),
      agent_phone_number: agent_phone_number.trim(),
      phone_numbers: resolvedPhoneNumbers,
    });
  }

  return cleaned;
}

export function validateRetryConfig(config: unknown): SarvamRetryConfig {
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
    if (
      typeof raw.retry_on !== "object" ||
      Array.isArray(raw.retry_on)
    ) {
      throw new ValidationError([
        {
          field: "retryConfig.retry_on",
          message: "retry_on must be an object of dynamic conditions.",
        },
      ]);
    }

    const validatedRetryOn: Record<
      string,
      { enabled: boolean; threshold_seconds?: number }
    > = {};

    for (const [key, cond] of Object.entries(raw.retry_on)) {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        throw new ValidationError([
          {
            field: "retryConfig.retry_on",
            message: "Condition key cannot be empty.",
          },
        ]);
      }

      if (typeof cond !== "object" || cond === null || Array.isArray(cond)) {
        throw new ValidationError([
          {
            field: `retryConfig.retry_on.${key}`,
            message: "Retry condition must be an object.",
          },
        ]);
      }

      const { enabled, threshold_seconds, ...extra } = cond as Record<
        string,
        unknown
      >;

      if (Object.keys(extra).length > 0) {
        throw new ValidationError([
          {
            field: `retryConfig.retry_on.${key}`,
            message: "Unrecognized properties in retry condition.",
          },
        ]);
      }

      if (typeof enabled !== "boolean") {
        throw new ValidationError([
          {
            field: `retryConfig.retry_on.${key}.enabled`,
            message: "enabled is required and must be a boolean.",
          },
        ]);
      }

      if (threshold_seconds !== undefined && threshold_seconds !== null) {
        if (
          typeof threshold_seconds !== "number" ||
          !Number.isInteger(threshold_seconds) ||
          threshold_seconds < 0
        ) {
          throw new ValidationError([
            {
              field: `retryConfig.retry_on.${key}.threshold_seconds`,
              message: "threshold_seconds must be a non-negative integer.",
            },
          ]);
        }
      }

      validatedRetryOn[trimmedKey] = {
        enabled,
        ...(threshold_seconds !== undefined && threshold_seconds !== null && { threshold_seconds }),
      };
    }

    result.retry_on = validatedRetryOn;
  }

  if (raw.retry_interval_minutes !== undefined && raw.retry_interval_minutes !== null) {
    if (typeof raw.retry_interval_minutes === "number") {
      if (
        !Number.isInteger(raw.retry_interval_minutes) ||
        raw.retry_interval_minutes < 0
      ) {
        throw new ValidationError([
          {
            field: "retryConfig.retry_interval_minutes",
            message: "retry_interval_minutes must be a non-negative integer.",
          },
        ]);
      }
      result.retry_interval_minutes = raw.retry_interval_minutes;
    } else if (Array.isArray(raw.retry_interval_minutes)) {
      for (let i = 0; i < raw.retry_interval_minutes.length; i++) {
        const item = raw.retry_interval_minutes[i];
        if (typeof item !== "number" || !Number.isInteger(item) || item < 0) {
          throw new ValidationError([
            {
              field: `retryConfig.retry_interval_minutes[${i}]`,
              message: "Each retry interval must be a non-negative integer.",
            },
          ]);
        }
      }
      // Preserve array data type
      result.retry_interval_minutes = [...raw.retry_interval_minutes];
    } else {
      throw new ValidationError([
        {
          field: "retryConfig.retry_interval_minutes",
          message:
            "retry_interval_minutes must be a single non-negative integer or an array of non-negative integers.",
        },
      ]);
    }
  }

  return result;
}

