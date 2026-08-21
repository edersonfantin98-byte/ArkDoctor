import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";

describe("createInMemoryFinanceRepository", () => {
  it("listFinancialEntries filters by account and date range (inclusive)", async () => {
    const repo = createInMemoryFinanceRepository();
    await repo.insertFinancialEntry("acc-1", {
      type: "revenue",
      amount: 100,
      defaultAmount: null,
      category: "Consulta",
      procedureId: null,
      description: null,
      occurredAt: "2026-08-01",
    });
    await repo.insertFinancialEntry("acc-1", {
      type: "revenue",
      amount: 200,
      defaultAmount: null,
      category: "Consulta",
      procedureId: null,
      description: null,
      occurredAt: "2026-08-31",
    });
    await repo.insertFinancialEntry("acc-1", {
      type: "revenue",
      amount: 999,
      defaultAmount: null,
      category: "Fora do range",
      procedureId: null,
      description: null,
      occurredAt: "2026-09-01",
    });

    const entries = await repo.listFinancialEntries("acc-1", { from: "2026-08-01", to: "2026-08-31" });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.amount)).toEqual([100, 200]);
  });
});
