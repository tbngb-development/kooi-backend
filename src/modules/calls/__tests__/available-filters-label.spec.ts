import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaCallRepository } from "../infrastructure/repositories/prisma-call.repository";
import prisma from "../../../shared/config/database/prisma";

vi.mock("../../../shared/config/database/prisma", () => ({
    default: {
        campaign: {
            findFirst: vi.fn(),
        },
    },
}));

describe("PrismaCallRepository.getAvailableFilters", () => {
    const repo = new PrismaCallRepository();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses the disposition display name as the filter label while keeping the raw name as the key", async () => {
        vi.mocked(prisma.campaign.findFirst).mockResolvedValue({
            assistant: {
                platformAgent: {
                    id: "agent-1",
                    categories: [
                        {
                            category: {
                                name: "Property Preference",
                                dispositions: [
                                    {
                                        disposition: {
                                            id: "disp-1",
                                            name: "purchase_timeline",
                                            displayName: "Purchase Timeline",
                                            slug: "purchase-timeline",
                                            isObjective: true,
                                            objectiveOptions: [
                                                {
                                                    value: "WITHIN_3_MONTHS",
                                                    sortOrder: 1,
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        } as never);

        const result = await repo.getAvailableFilters(
            "tenant-1",
            "campaign-1",
        );

        expect(result.dynamic).toHaveLength(1);
        expect(result.dynamic[0]).toEqual({
            id: "disp-1",
            label: "Purchase Timeline",
            disposition: "purchase_timeline",
            category: "Property Preference",
            options: ["WITHIN_3_MONTHS"],
        });
    });
});
