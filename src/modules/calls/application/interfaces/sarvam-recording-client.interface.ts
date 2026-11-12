export interface DownloadSarvamRecordingParams {
  organizationId: string;
  workspaceId: string;
  appId: string;
  interactionId: string;
  apiKey: string;
}

export interface ISarvamRecordingClient {
  /**
   * Downloads a binary WAV audio stream from the official Sarvam recording endpoint:
   * GET https://apps.sarvam.ai/api/analytics/v1/{org_id}/{workspace_id}/{app_id}/recordings/{interaction_id}
   *
   * @throws SarvamRecordingNotFoundError on HTTP 404 (recording delayed/not yet generated)
   * @throws SarvamRecordingRateLimitError on HTTP 429
   * @throws SarvamRecordingPermanentError on HTTP 400, 401, 403, 422
   * @throws Error on 5xx or network errors (retryable)
   */
  downloadRecordingWav(params: DownloadSarvamRecordingParams): Promise<Buffer>;
}

