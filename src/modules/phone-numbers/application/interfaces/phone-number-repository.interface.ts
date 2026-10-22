import type {
  CreatePhoneNumberDto,
  UpdatePhoneNumberDto,
  AssignPhoneNumberDto,
  PhoneNumberFilterDto,
  PhoneNumberDetailDto,
  TenantInboundAssistantDto,
} from "../dto/phone-number.dto";

export interface IPhoneNumberRepository {
  create(
    dto: CreatePhoneNumberDto & { normalizedPhone: string },
  ): Promise<PhoneNumberDetailDto>;
  findById(id: string): Promise<PhoneNumberDetailDto | null>;
  findByPhoneNumber(phoneNumber: string): Promise<PhoneNumberDetailDto | null>;
  findFirstByTenantId(tenantId: string): Promise<PhoneNumberDetailDto | null>;
  findByTenantId(tenantId: string): Promise<PhoneNumberDetailDto[]>;
  list(filter: PhoneNumberFilterDto): Promise<{
    phoneNumbers: PhoneNumberDetailDto[];
    total: number;
    stats: {
      total: number;
      assigned: number;
      available: number;
      active: number;
    };
  }>;
  update(id: string, dto: UpdatePhoneNumberDto): Promise<PhoneNumberDetailDto>;
  assign(id: string, dto: AssignPhoneNumberDto): Promise<PhoneNumberDetailDto>;
  unassign(id: string): Promise<PhoneNumberDetailDto>;
  delete(id: string): Promise<void>;
  countCallsByPhoneNumber(phoneNumber: string): Promise<number>;
  getTenantInboundAssistants(
    tenantId: string,
  ): Promise<TenantInboundAssistantDto[]>;
  checkTenantExists(tenantId: string): Promise<boolean>;
  checkAssistantBelongsToTenant(
    assistantId: string,
    tenantId: string,
  ): Promise<boolean>;
  /**
   * Returns active phone numbers assigned to a tenant that support
   * outbound calling (capability = OUTBOUND or BOTH).
   */
  findOutboundPhoneNumbers(tenantId: string): Promise<string[]>;
}
