import axios from "axios";
import type {
  DownloadSarvamRecordingParams,
  ISarvamRecordingClient,
} from "../../application/interfaces/sarvam-recording-client.interface";
import {
  SarvamRecordingNotFoundError,
  SarvamRecordingRateLimitError,
  SarvamRecordingPermanentError,
} from "../../domain/errors/sarvam-recording.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class SarvamRecordingClient implements ISarvamRecordingClient {
  constructor(private readonly logger?: Logger) {}

  async downloadRecordingWav(
    params: DownloadSarvamRecordingParams,
  ): Promise<Buffer> {
    const { organizationId, workspaceId, appId, interactionId, apiKey } = params;

    // Build URL without double-encoding interactionId which contains a valid slash path
    const url = `https://apps.sarvam.ai/api/analytics/v1/${encodeURIComponent(
      organizationId,
    )}/${encodeURIComponent(workspaceId)}/${encodeURIComponent(
      appId,
    )}/recordings/${interactionId}`;

    this.logger?.debug("Fetching Sarvam call recording WAV stream", {
      action: "sarvam_recording.download_start",
      organizationId,
      workspaceId,
      appId,
      interactionId,
    });

    try {
      const response = await axios.get<ArrayBuffer>(url, {
        headers: {
          "X-API-Key": apiKey,
        },
        responseType: "arraybuffer",
        timeout: 30_000,
      });

      const buffer = Buffer.from(response.data);

      this.logger?.info("Sarvam call recording WAV downloaded successfully", {
        action: "sarvam_recording.download_success",
        interactionId,
        bytes: buffer.byteLength,
        contentType: response.headers["content-type"],
      });

      return buffer;
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const status = err.response.status;

        if (status === 404) {
          throw new SarvamRecordingNotFoundError(
            interactionId,
            `Recording for interaction '${interactionId}' is not yet available or app ID is incorrect.`,
          );
        }

        if (status === 429) {
          const retryAfterHeader = err.response.headers["retry-after"];
          const retryAfterSeconds = retryAfterHeader
            ? parseInt(String(retryAfterHeader), 10)
            : undefined;
          throw new SarvamRecordingRateLimitError(
            Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
          );
        }

        if (status === 400) {
          throw new SarvamRecordingPermanentError(
            400,
            `Malformed interaction ID: ${interactionId}`,
            "SARVAM_RECORDING_BAD_REQUEST",
          );
        }

        if (status === 401) {
          throw new SarvamRecordingPermanentError(
            401,
            "Sarvam API key is unauthorized or missing.",
            "SARVAM_RECORDING_UNAUTHORIZED",
          );
        }

        if (status === 403) {
          throw new SarvamRecordingPermanentError(
            403,
            "Sarvam API key does not have access to this organization or workspace.",
            "SARVAM_RECORDING_FORBIDDEN",
          );
        }

        if (status === 422) {
          throw new SarvamRecordingPermanentError(
            422,
            "Invalid or missing path parameter for Sarvam recording request.",
            "SARVAM_RECORDING_VALIDATION_ERROR",
          );
        }

        // 500, 502, 503, 504 - retryable
        throw new Error(
          `Sarvam recording upstream server error: HTTP ${status}`,
        );
      }

      // Network errors, DNS resolution, timeouts - retryable
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Sarvam recording network error: ${message}`);
    }
  }
}

