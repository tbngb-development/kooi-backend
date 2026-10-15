import type {
  TelephonyProviderType,
  PhoneStatusType,
  PhoneCapabilityType,
} from "../../domain/entities/phone-number.entity";

export interface CreatePhoneNumberDto {
  phoneNumber: string;
  friendlyName?: string;
  provider?: TelephonyProviderType;
  capabilities?: PhoneCapabilityType;
  status?: PhoneStatusType;
  tenantId?: string;
  assistantId?: string;
}

export interface UpdatePhoneNumberDto {
  friendlyName?: string;
  provider?: TelephonyProviderType;
  status?: PhoneStatusType;
  capabilities?: PhoneCapabilityType;
}

export interface AssignPhoneNumberDto {
  tenantId: string;
  assistantId?: string | null;
}

export interface PhoneNumberFilterDto {
  search?: string;
  status?: PhoneStatusType;
  provider?: TelephonyProviderType;
  capabilities?: PhoneCapabilityType;
  isAssigned?: boolean;
  tenantId?: string;
  page?: number;
  limit?: number;
}

export interface PhoneNumberDetailDto {
  id: string;
  phoneNumber: string;
  friendlyName: string | null;
  provider: TelephonyProviderType;
  status: PhoneStatusType;
  capabilities: PhoneCapabilityType;
  tenantId: string | null;
  assistantId: string | null;
  tenant?: {
    id: string;
    name: string;
    email: string;
  } | null;
  assistant?: {
    id: string;
    name: string;
    platformAgent?: {
      id: string;
      name: string;
      type: string;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneNumberListResponseDto {
  phoneNumbers: PhoneNumberDetailDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    total: number;
    assigned: number;
    available: number;
    active: number;
  };
}

export interface TenantInboundAssistantDto {
  id: string;
  name: string;
  platformAgentName?: string;
  platformAgentType?: string;
}
