import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type {
  ListTransactionsQuery,
  PaginatedTransactionsResponse,
} from "../dto/wallet.dto";
import { toWalletTransactionResponse } from "../mappers/wallet.mapper";

export class ListTransactionsUseCase {
  constructor(private readonly walletRepo: WalletRepository) {}

  async execute(
    tenantId: string,
    query: ListTransactionsQuery,
  ): Promise<PaginatedTransactionsResponse> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const { items, total } = await this.walletRepo.listTransactions(tenantId, {
      page,
      limit,
      type: query.type,
      sourceType: query.sourceType,
      startDate,
      endDate,
    });

    return {
      items: items.map(toWalletTransactionResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
