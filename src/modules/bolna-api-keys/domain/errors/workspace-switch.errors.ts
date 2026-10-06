import { AppError } from "../../../../shared/errors/app.error";

export class WorkspaceSwitchAlreadyInProgressError extends AppError {
  constructor(tenantId: string) {
    super(
      409,
      `A workspace switch migration is already in progress for tenant ${tenantId}.`,
      "WORKSPACE_SWITCH_IN_PROGRESS",
    );
  }
}

export class ActiveCampaignsBlockSwitchError extends AppError {
  constructor(count: number) {
    super(
      409,
      `Cannot switch workspace: ${count} campaign(s) are currently RUNNING. Stop or wait for active campaigns to finish.`,
      "ACTIVE_CAMPAIGNS_BLOCK_SWITCH",
    );
  }
}

export class ActiveBatchesBlockSwitchError extends AppError {
  constructor(count: number) {
    super(
      409,
      `Cannot switch workspace: ${count} batch(es) are currently RUNNING, SCHEDULED, or PROCESSING.`,
      "ACTIVE_BATCHES_BLOCK_SWITCH",
    );
  }
}

export class ActiveCallsBlockSwitchError extends AppError {
  constructor(count: number) {
    super(
      409,
      `Cannot switch workspace: ${count} live call(s) are in progress.`,
      "ACTIVE_CALLS_BLOCK_SWITCH",
    );
  }
}

export class TenantAlreadyOnTargetKeyError extends AppError {
  constructor(keyIdentifier: string) {
    super(
      400,
      `Tenant is already assigned to the requested Bolna API key (${keyIdentifier}).`,
      "TENANT_ALREADY_ON_TARGET_KEY",
    );
  }
}   