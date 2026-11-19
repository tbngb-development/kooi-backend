/** Deployment labels accepted by the Discord notification service. */
export const APP_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export function isAppEnvironment(value: unknown): value is AppEnvironment {
  return (
    typeof value === "string" &&
    (APP_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

/**
 * Resolves the label stamped on outgoing Discord events.
 *
 * `APP_ENV` wins when set. Otherwise `NODE_ENV` seeds the value so existing
 * deployments (`.env.staging`, `.env.production`) work without changes, and
 * anything else becomes `development`.
 */
export function resolveAppEnvironment(
  appEnv: string | undefined,
  nodeEnv: string | undefined,
): AppEnvironment {
  const explicit = appEnv?.trim();
  if (explicit) {
    if (!isAppEnvironment(explicit)) {
      throw new Error(
        `Invalid APP_ENV: expected one of ${APP_ENVIRONMENTS.join(", ")}`,
      );
    }
    return explicit;
  }

  return isAppEnvironment(nodeEnv) ? nodeEnv : "development";
}
