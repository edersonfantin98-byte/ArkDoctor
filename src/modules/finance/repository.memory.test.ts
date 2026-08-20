import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";

describe("createInMemoryFinanceRepository", () => {
  it("scopes procedures and entries by accountId", async () => {
    const repo = createInMemoryFinanceRepository();
    await repo.insertProcedure("acc-1", { name: "Consulta", defaultPrice: 150 });
    await repo.insertProcedure("acc-2", { name: "Outra conta", defaultPrice: 50 });

    const acc1Procedures = await repo.listProcedures("acc-1");
    expect(acc1Procedures).toHaveLength(1);
    expect(acc1Procedures[0].name).toBe("Consulta");
  });

  it("listProcedures filters by activeOnly", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await repo.insertProcedure("acc-1", { name: "Consulta", defaultPrice: 150 });
    await repo.updateProcedure("acc-1", procedure.id, { active: false });

    expect(await repo.listProcedures("acc-1")).toHaveLength(1);
    expect(await repo.listProcedures("acc-1", { activeOnly: true })).toHaveLength(0);
  });

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
