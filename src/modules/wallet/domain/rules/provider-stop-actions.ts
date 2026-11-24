import type {
  ProviderStopResult,
  ProviderStopTarget,
} from "../../application/interfaces/campaign-stop-adapter.interface";

/**
 * Provider stops are retried by target, not by current DB batch status: local
 * stops are applied before remote calls, so a status-driven retry finds nothing
 * and would silently convert a remote failure into a clean block.
 */
export function providerStopTargetKey(target: ProviderStopTarget): string {
  return `${target.provider}:${target.kind ?? "UNKNOWN"}:${target.targetId}`;
}

export function toProviderStopResults(value: unknown): ProviderStopResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isProviderStopResult);
}

function isProviderStopResult(value: unknown): value is ProviderStopResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProviderStopResult>;
  const target = candidate.target as Partial<ProviderStopTarget> | undefined;
  return (
    typeof candidate.success === "boolean" &&
    Boolean(target) &&
    typeof target?.provider === "string" &&
    typeof target?.targetId === "string"
  );
}

/**
 * Latest outcome per target, so a successful retry clears a prior failure
 * while repeated failures keep only the newest error. The array stays bounded
 * by the number of targets and is safe to persist as the incident's audit of
 * what enforcement actually confirmed.
 */
export function mergeProviderActions(
  prior: ProviderStopResult[],
  next: ProviderStopResult[],
): ProviderStopResult[] {
  const byTarget = new Map<string, ProviderStopResult>();
  for (const action of [...prior, ...next]) {
    byTarget.set(providerStopTargetKey(action.target), action);
  }
  return [...byTarget.values()];
}

/**
 * Concrete remote targets still needing confirmation. Adapter/LOCAL failures
 * carry no retryable provider identity and are intentionally excluded: a
 * LOCAL failure leaves its batch stoppable, so normal discovery picks it up.
 */
export function unresolvedProviderTargets(
  actions: ProviderStopResult[],
): ProviderStopTarget[] {
  const latest = new Map<string, ProviderStopResult>();
  for (const action of actions) {
    latest.set(providerStopTargetKey(action.target), action);
  }
  return [...latest.values()]
    .filter(
      (action) =>
        !action.success &&
        (action.target.provider === "BOLNA" ||
          action.target.provider === "SARVAM"),
    )
    .map((action) => action.target);
}
