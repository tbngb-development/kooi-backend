import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../../batches/application/interfaces/batch-repository.interface";
import type {
  PlanRepository,
  TenantActivePlan,
} from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { ParseLeadsInput, ParseLeadsOutput } from "../dto/campaign.dto";
import {
  CampaignNotFoundError,
  CampaignFailedError,
} from "../../domain/errors/campaign.errors";
import {
  parseLeadBuffer,
  isIndianPhone,
  type LeadRow,
} from "../../../leads/infrastructure/leadParser";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import { env } from "../../../../shared/config/env";
import { MaxLeadsPerBatchExceededError } from "../../../batches/domain/errors/batch.errors";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";

export class ParseLeadsUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly batchRepo: BatchRepository,
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
  ) {}

  async execute(input: ParseLeadsInput): Promise<ParseLeadsOutput> {
    const campaign = await this.campaignRepo.findById(
      input.tenantId,
      input.campaignId,
    );

    if (!campaign) throw new CampaignNotFoundError();
    if (campaign.status === "FAILED") {
      throw new CampaignFailedError("parse leads for");
    }

    // 1. Fetch active plan
    const activePlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );

    if (!activePlan) throw new TenantPlanNotFoundError(input.tenantId);

    // 2. Parse file
    const { rows, headerInfo } = parseLeadBuffer(
      input.fileBuffer,
      input.fileName,
    );

    if (rows.length === 0) {
      const zeroEstimation = await this.calculateEmptyEstimation(
        input.tenantId,
        activePlan,
      );
      return {
        total: 0,
        valid: 0,
        invalid: 0,
        nonIndian: 0,
        nonIndianNumbers: [],
        inFileDuplicates: 0,
        inFileDuplicateNumbers: [],
        dbDuplicates: 0,
        dbDuplicateNumbers: [],
        readyToImport: 0,
        detectedHeaders: {
          contact_number: headerInfo.hasContactNumber,
          customer_name: headerInfo.hasCustomerName,
        },
        estimation: zeroEstimation,
      };
    }

    const rowsWithPhone = rows.filter((r) => r.phone && r.phone.trim() !== "");
    const missingPhoneCount = rows.length - rowsWithPhone.length;

    const indianRows = rowsWithPhone
      .filter((r) => isIndianPhone(r.phone))
      .map((r) => ({ ...r, phone: normalizePhoneNumber(r.phone) }));

    const nonIndianNumbers = rowsWithPhone
      .filter((r) => !isIndianPhone(r.phone))
      .map((r) => r.phone);

    // In-file deduplication
    const seenInFile = new Set<string>();
    const inFileDuplicateNumbers: string[] = [];
    const uniqueRows: LeadRow[] = [];

    for (const row of indianRows) {
      if (seenInFile.has(row.phone)) {
        inFileDuplicateNumbers.push(row.phone);
      } else {
        seenInFile.add(row.phone);
        uniqueRows.push(row);
      }
    }

    // Cross-batch deduplication
    const dbDuplicateNumbers: string[] = [];
    let newLeads: LeadRow[] = [];

    if (env.skipCrossBatchDedup) {
      newLeads = uniqueRows;
    } else {
      const uniquePhones = uniqueRows.map((r) => r.phone);
      const existingPhones = await this.batchRepo.findExistingPhones(
        input.campaignId,
        uniquePhones,
      );

      for (const row of uniqueRows) {
        if (existingPhones.has(row.phone)) {
          dbDuplicateNumbers.push(row.phone);
        } else {
          newLeads.push(row);
        }
      }
    }

    // 3. Enforce maxLeadsPerBatch limit (null = unlimited)
    if (
      activePlan &&
      activePlan.maxLeadsPerBatch !== null &&
      activePlan.maxLeadsPerBatch !== undefined
    ) {
      if (newLeads.length > activePlan.maxLeadsPerBatch) {
        throw new MaxLeadsPerBatchExceededError(
          activePlan.maxLeadsPerBatch,
          newLeads.length,
        );
      }
    }

    // 4. Generate Financial Cost Estimations
    const estimation = await this.estimateCampaignCost(
      input.tenantId,
      newLeads.length,
      activePlan,
    );

    return {
      total: rows.length,
      valid: indianRows.length,
      invalid: missingPhoneCount,
      nonIndian: nonIndianNumbers.length,
      nonIndianNumbers,
      inFileDuplicates: inFileDuplicateNumbers.length,
      inFileDuplicateNumbers,
      dbDuplicates: dbDuplicateNumbers.length,
      dbDuplicateNumbers,
      readyToImport: newLeads.length,
      detectedHeaders: {
        contact_number: headerInfo.hasContactNumber,
        customer_name: headerInfo.hasCustomerName,
      },
      estimation,
    };
  }

  private async estimateCampaignCost(
    tenantId: string,
    leadCount: number,
    activePlan: TenantActivePlan,
  ): Promise<ParseLeadsOutput["estimation"]> {
    const ANSWER_RATE = 0.4;
    const RETRIES = 1;
    const MIN_DURATION_SEC = 45;
    const MAX_DURATION_SEC = 90;

    const perMinuteRate = activePlan.perMinuteRate;
    const billingMinSec = activePlan.billingMinimumSec;
    const billingIncrementSec = activePlan.billingIncrementSec;

    // 3. Fetch Tenant Wallet Balance
    const wallet = await this.walletRepo.findByTenantId(tenantId);
    const cashBalance = wallet?.cashBalance ?? 0;
    const bonusBalance = wallet?.bonusBalance ?? 0;
    const currentBalancePaisa = cashBalance + bonusBalance;

    if (leadCount === 0) {
      return {
        estimatedCostMinPaisa: 0,
        estimatedCostMaxPaisa: 0,
        currentBalancePaisa,
        perMinuteRatePaisa: perMinuteRate,
        assumptions: {
          historicalAnswerRate: ANSWER_RATE,
          retryCount: RETRIES,
          durationMinSec: MIN_DURATION_SEC,
          durationMaxSec: MAX_DURATION_SEC,
        },
      };
    }

    const firstAttemptConnected = leadCount * ANSWER_RATE;
    const firstAttemptFailed = leadCount * (1 - ANSWER_RATE);
    const retryAttemptConnected = firstAttemptFailed * ANSWER_RATE;
    const totalConnectedCalls = firstAttemptConnected + retryAttemptConnected;

    const getBilledSeconds = (durationSec: number): number => {
      let billed = Math.max(durationSec, billingMinSec);
      if (billingIncrementSec > 0) {
        billed = Math.ceil(billed / billingIncrementSec) * billingIncrementSec;
      }
      return billed;
    };

    const minBilledSec = getBilledSeconds(MIN_DURATION_SEC);
    const maxBilledSec = getBilledSeconds(MAX_DURATION_SEC);

    const costPerCallMinPaisa = (minBilledSec / 60) * perMinuteRate;
    const costPerCallMaxPaisa = (maxBilledSec / 60) * perMinuteRate;

    const estimatedCostMinPaisa = Math.round(
      totalConnectedCalls * costPerCallMinPaisa,
    );
    const estimatedCostMaxPaisa = Math.round(
      totalConnectedCalls * costPerCallMaxPaisa,
    );

    return {
      estimatedCostMinPaisa,
      estimatedCostMaxPaisa,
      currentBalancePaisa,
      perMinuteRatePaisa: perMinuteRate,
      assumptions: {
        historicalAnswerRate: ANSWER_RATE,
        retryCount: RETRIES,
        durationMinSec: MIN_DURATION_SEC,
        durationMaxSec: MAX_DURATION_SEC,
      },
    };
  }

  private async calculateEmptyEstimation(
    tenantId: string,
    activePlan: TenantActivePlan,
  ): Promise<ParseLeadsOutput["estimation"]> {
    const perMinuteRate = activePlan.perMinuteRate ?? 500;
    const wallet = await this.walletRepo.findByTenantId(tenantId);
    const currentBalancePaisa =
      (wallet?.cashBalance ?? 0) + (wallet?.bonusBalance ?? 0);

    return {
      estimatedCostMinPaisa: 0,
      estimatedCostMaxPaisa: 0,
      currentBalancePaisa,
      perMinuteRatePaisa: perMinuteRate,
      assumptions: {
        historicalAnswerRate: 0.4,
        retryCount: 1,
        durationMinSec: 45,
        durationMaxSec: 90,
      },
    };
  }
}
