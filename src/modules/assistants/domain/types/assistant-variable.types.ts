export type WelcomeMessageType = "default" | "custom";

export interface WelcomeMessageConfig {
  type: WelcomeMessageType;
  defaultValue: string;
  customValue?: string;
}

export interface AssistantCallTypeConfig {
  variables?: Record<string, string>;
  welcomeMessage?: WelcomeMessageConfig;
}

export interface AssistantVariablesConfig {
  inbound?: AssistantCallTypeConfig;
  outbound?: AssistantCallTypeConfig;
}
