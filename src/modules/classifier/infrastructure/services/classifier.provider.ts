import {
  ClassifierClient,
  type JevQuestion,
  type JevSystemOneResponse,
} from "../../../../shared/config/external/classifier/classifier.client";
import { ClassifierEvaluationError } from "../../domain/errors/classifier.errors";
import type { ClassifierProvider } from "../../application/interfaces/classifier-provider.interface";
import type {
  ClassifierEvaluationParams,
  ClassifierEvaluationResult,
} from "../../application/dto/classifier.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ClassifierProviderImpl implements ClassifierProvider {
  private readonly client: ClassifierClient;
  private readonly log: Logger | undefined;

  constructor(client?: ClassifierClient, logger?: Logger) {
    this.client = client ?? new ClassifierClient();
    this.log = logger?.child({ component: "ClassifierProvider" });
  }

  async evaluate(
    params: ClassifierEvaluationParams,
  ): Promise<ClassifierEvaluationResult> {
    try {
      const response: JevSystemOneResponse = await this.client.systemOne(
        params.state,
        params.questions as Record<string, JevQuestion>,
      );

      // Handle raw response safety
      const answers = response.answers ?? {};
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      // Extract gateway or provider cost metadata (if routed via AI Gateway)
      const gatewayCost = response.provider_metadata?.gateway?.cost ?? null;

      return {
        answers: answers as any,
        inputTokens,
        outputTokens,
        gatewayCost,
        rawResponse: response as unknown as Record<string, unknown>,
      };
    } catch (err: any) {
      // 1. Extract detailed error messages from TypeSafe / AI Gateway
      const upstreamData = err?.response?.data;
      const statusCode = err?.response?.status;

      let errorMessage: string;

      if (typeof upstreamData === "string") {
        errorMessage = upstreamData;
      } else if (upstreamData?.detail) {
        if (typeof upstreamData.detail === "string") {
          errorMessage = upstreamData.detail;
        } else if (upstreamData.detail?.message) {
          errorMessage = `[${upstreamData.detail.error_type || "api_error"}] ${upstreamData.detail.message}`;
        } else if (Array.isArray(upstreamData.detail)) {
          // FastAPI / pydantic validation errors list
          errorMessage = upstreamData.detail
            .map((e: any) =>
              e?.loc
                ? `${e.loc.filter((x: any) => x !== "body").join(".")}: ${e.msg || e.message}`
                : e?.msg || e?.message || String(e),
            )
            .join("; ");
        } else {
          errorMessage = JSON.stringify(upstreamData.detail);
        }
      } else if (upstreamData?.message) {
        errorMessage = upstreamData.message;
      } else if (upstreamData?.error?.message) {
        errorMessage = upstreamData.error.message;
      } else if (typeof upstreamData?.error === "string") {
        errorMessage = upstreamData.error;
      } else if (upstreamData?.error_type) {
        errorMessage = `[${upstreamData.error_type}] ${upstreamData.message || "Invalid request"}`;
      } else if (
        upstreamData &&
        typeof upstreamData === "object" &&
        Object.keys(upstreamData).length > 0
      ) {
        errorMessage = JSON.stringify(upstreamData);
      } else {
        errorMessage = err?.message || "Unknown upstream classifier error";
      }

      // 2. Log full debugging diagnostics
      this.log?.error("Classifier evaluation failed upstream", err, {
        action: "classifier.evaluate.error",
        statusCode,
        upstreamData,
        errorMessage,
      });

      // 3. Throw domain-specific error
      throw new ClassifierEvaluationError(
        statusCode ? `[HTTP ${statusCode}] ${errorMessage}` : errorMessage,
      );
    }
  }
}
