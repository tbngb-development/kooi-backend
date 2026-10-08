import axios, { type AxiosInstance } from "axios";
import { env } from "../../env";

export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
}

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion;

export interface JevSystemOneRequest {
  model?: string;
  state: string;
  questions: Record<string, JevQuestion>;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer;

export interface JevSystemOneResponse {
  model?: string;
  answers: Record<string, JevAnswer>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  provider_metadata?: {
    gateway?: {
      cost?: string;
      [key: string]: unknown;
    };
  };
}

export class ClassifierClient {
  private readonly http: AxiosInstance;
  private readonly model: string;
  private readonly isNative: boolean;

  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    isNative?: boolean;
  }) {
    this.isNative = options?.isNative ?? env.classifier.provider === "native";
    this.model = options?.model ?? env.classifier.model;

    // Resolve API key & Base URL based on provider
    const apiKey =
      options?.apiKey ||
      (this.isNative
        ? env.classifier.typesafeApiKey
        : env.classifier.aiGatewayApiKey);

    const baseUrl =
      options?.baseUrl ||
      (this.isNative
        ? env.classifier.typesafeBaseUrl
        : env.classifier.aiGatewayBaseUrl);

    if (!apiKey) {
      throw new Error(
        `Classifier API Key is missing. Set ${this.isNative ? "TYPESAFE_API_KEY" : "AI_GATEWAY_API_KEY"} in your .env.`,
      );
    }

    // Clean trailing slashes
    const sanitizedBaseUrl = baseUrl.replace(/\/+$/, "");

    this.http = axios.create({
      baseURL: sanitizedBaseUrl,
      timeout: 60_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async systemOne(
    state: string,
    questions: Record<string, JevQuestion>,
  ): Promise<JevSystemOneResponse> {
    const payload: JevSystemOneRequest = {
      model: this.model,
      state,
      questions,
    };

    const response = await this.http.post<JevSystemOneResponse>(
      "/v1/systemone",
      payload,
    );

    return response.data;
  }
}
