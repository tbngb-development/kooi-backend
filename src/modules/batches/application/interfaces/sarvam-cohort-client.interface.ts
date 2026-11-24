export interface SarvamCohortResult {
  total_records: number;
  valid_records: number;
  rejected_records: number;
}

export interface SarvamCohortResponse {
  name: string;
  cohort_id: string;
  status: "processing" | "completed" | "failed";
  source_type: "pre_signed_url" | "file_upload";
  cohort_category: "cohort" | "stop_file";
  created_by: string;
  created_at: string;
  updated_at: string;
  result?: SarvamCohortResult | null;
  updated_by?: string | null;
}

export interface UploadSarvamCohortParams {
  organizationId: string;
  workspaceId: string;
  campaignId: string;
  apiKey: string;
  name: string;
  cohortFile: Buffer;
  cohortFileName: string;
  transformationJson: Record<string, unknown>;
  cohortCategory?: "cohort" | "stop_file";
}

export interface GetSarvamCohortParams {
  organizationId: string;
  workspaceId: string;
  campaignId: string;
  cohortId: string;
  apiKey: string;
}

export interface ISarvamCohortClient {
  uploadCohort(params: UploadSarvamCohortParams): Promise<SarvamCohortResponse>;
  getCohort(params: GetSarvamCohortParams): Promise<SarvamCohortResponse>;
}

