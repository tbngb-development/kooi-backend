import type { CallingWindowService } from "../../../campaigns/application/services/calling-window.service";
import { evaluateNewDial } from "../../../../shared/utils/calling-window-guards";
import { BatchOperationError } from "../../domain/errors/batch.errors";

function describeBlockedDial(nextStart: Date | null): string {
  const suffix = nextStart
    ? ` Next window starts at ${nextStart.toISOString()}.`
    : "";
  return `New calls cannot start outside the calling window.${suffix}`;
}

/** D2: blocks user-triggered dials while leaving in-flight calls untouched. */
export async function assertNewDialAllowed(
  callingWindowService: CallingWindowService | undefined,
  tenantId: string,
  campaignId: string,
  at: Date,
): Promise<void> {
  if (!callingWindowService) return;

  const window = await callingWindowService.resolveWindow(tenantId, campaignId);
  const decision = evaluateNewDial(window, at);
  if (!decision.allowed) {
    throw new BatchOperationError(describeBlockedDial(decision.nextStart));
  }
}
