import type { VoiceProvider } from "@prisma/client";

export interface UpdateTenantInput {
  name?: string;
  isActive?: boolean;
  suspensionReason?: string | null;
  suspendedAt?: Date | null;
  suspendedBy?: string | null;
  voiceProvider?: VoiceProvider;
  bolnaApiKeyId?: string | null;
}
