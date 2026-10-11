export interface SourceMetricDTO {
  totalCalls: number;
  completedCalls: number;
  durationSec: number;
  costPaisa: number;
}

export interface CallCenterKPIsDTO {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  totalDurationSec: number;
  avgDurationSec: number;
  totalCostPaisa: number;
  answerRate: number; // 0 - 100 percentage
  sourceBreakdown: {
    campaign: SourceMetricDTO;
    inbound: SourceMetricDTO;
    quickDial: SourceMetricDTO;
  };
  statusBreakdown: Record<string, number>;
}

export interface NumberRosterItemDTO {
  id: string;
  phoneNumber: string;
  provider: string;
  status: string;
  syncStatus: string;
  assignedAssistant: {
    id: string;
    name: string;
  } | null;
  totalCalls: number;
  totalMinutes: number;
  totalCostPaisa: number;
  lastCallAt: Date | null;
  monthlyRentalPaisa: number;
  renewalDate: Date | null;
}

export interface ExportCallsQueryDTO {
  source?: "CAMPAIGN" | "INBOUND" | "QUICK_DIAL";
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}
