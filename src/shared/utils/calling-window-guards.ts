import {
  getNextWindowStart,
  getWindowState,
  type CallingWindow,
  type CallingWindowState,
} from "./calling-window";

export type NewDialDecision =
  | { allowed: true }
  | {
      allowed: false;
      state: CallingWindowState;
      nextStart: Date | null;
    };

/** D2: only new dials are blocked; in-flight calls are not evaluated here. */
export function evaluateNewDial(
  window: CallingWindow | null,
  at: Date,
): NewDialDecision {
  if (!window) return { allowed: true };

  const state = getWindowState(window, at);
  if (state === "OPEN") return { allowed: true };

  return {
    allowed: false,
    state,
    nextStart: getNextWindowStart(window, at),
  };
}
