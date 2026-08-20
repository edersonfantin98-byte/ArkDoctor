import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";
import {
  createProcedure,
  updateProcedure,
  deactivateProcedure,
  listProcedures,
  getProcedureDefaults,
  createFinancialEntry,
  listFinancialEntries,
  getDashboardMetrics,
} from "./service";

describe("createProcedure", () => {
  it("creates a procedure with the given fields", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });
    expect(procedure.name).toBe("Consulta");
    expect(procedure.defaultPrice).toBe(150);
    expect(procedure.active).toBe(true);
  });

  it("rejects a non-positive price", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 0 })).rejects.toThrow();
  });
});

describe("updateProcedure / deactivateProcedure", () => {
  it("updates only the provided fields", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 150 });

    const updated = await updateProcedure(repo, "acc-1", procedure.id, { defaultPrice: 180 });

    expect(updated.name).toBe("Consulta");
    expect(updated.defaultPrice).toBe(180);
  });

  it("deactivateProcedure sets active to false without deleting it", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 150 });

    const deactivated = await deactivateProcedure(repo, "acc-1", procedure.id);

    expect(deactivated.active).toBe(false);
    expect(await listProcedures(repo, "acc-1")).toHaveLength(1);
  });
});

describe("getProcedureDefaults", () => {
  it("returns the default price and category for pre-filling a revenue entry", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });

    const defaults = await getProcedureDefaults(repo, "acc-1", procedure.id);

    expect(defaults).toEqual({ defaultPrice: 150, category: "Atendimento" });
  });

  it("rejects an unknown procedure", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(getProcedureDefaults(repo, "acc-1", "missing-id")).rejects.toThrow();
  });
});

describe("createFinancialEntry", () => {
  it("creates a manual expense with no procedure", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "expense",
      amount: 80,
      category: "Material",
      occurredAt: "2026-08-15",
    });

    expect(entry.type).toBe("expense");
    expect(entry.procedureId).toBeNull();
    expect(entry.defaultAmount).toBeNull();
  });

  it("rejects an expense with a procedureId", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 150 });

    await expect(
      createFinancialEntry(repo, "acc-1", {
        type: "expense",
        amount: 80,
        category: "Material",
        procedureId: procedure.id,
        occurredAt: "2026-08-15",
      }),
    ).rejects.toThrow();
  });

  it("rejects an expense with no category", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(
      createFinancialEntry(repo, "acc-1", { type: "expense", amount: 80, occurredAt: "2026-08-15" }),
    ).rejects.toThrow();
  });

  it("snapshots defaultAmount and inherits category from the linked procedure on revenue", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 120,
      procedureId: procedure.id,
      occurredAt: "2026-08-15",
    });

    expect(entry.amount).toBe(120);
    expect(entry.defaultAmount).toBe(150);
    expect(entry.category).toBe("Atendimento");
  });

  it("lets an explicit category override the procedure's category", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 120,
      procedureId: procedure.id,
      category: "Promoção",
      occurredAt: "2026-08-15",
    });

    expect(entry.category).toBe("Promoção");
  });

  it("allows revenue with no linked procedure, as long as it has a category", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 50,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    expect(entry.procedureId).toBeNull();
    expect(entry.defaultAmount).toBeNull();
  });
});

describe("listFinancialEntries", () => {
  it("delegates to the repository", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 100,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    const entries = await listFinancialEntries(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });
    expect(entries).toHaveLength(1);
  });
});

describe("getDashboardMetrics", () => {
  async function seedAugust(repo: ReturnType<typeof createInMemoryFinanceRepository>) {
    const consulta = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });
    const curativo = await createProcedure(repo, "acc-1", {
      name: "Curativo",
      defaultPrice: 50,
      category: "Atendimento",
    });

    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      procedureId: consulta.id,
      occurredAt: "2026-08-05",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      procedureId: consulta.id,
      occurredAt: "2026-08-10",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 50,
      procedureId: curativo.id,
      occurredAt: "2026-08-12",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "expense",
      amount: 100,
      category: "Material",
      occurredAt: "2026-08-20",
    });

    return { consulta, curativo };
  }

  it("sums revenue, expense, and balance for the period", async () => {
    const repo = createInMemoryFinanceRepository();
    await seedAugust(repo);

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.revenueTotal).toBe(350);
    expect(metrics.expenseTotal).toBe(100);
    expect(metrics.balance).toBe(250);
  });

  it("computes revenueChangePct against the equivalent-length prior period", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 100,
      category: "Avulso",
      occurredAt: "2026-07-15",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.revenueChangePct).toBe(50);
  });

  it("returns null revenueChangePct when the prior period had no revenue", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.revenueChangePct).toBeNull();
  });

  it("computes averageTicket over revenue entries only", async () => {
    const repo = createInMemoryFinanceRepository();
    await seedAugust(repo);

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    // (150 + 150 + 50) / 3 revenue entries
    expect(metrics.averageTicket).toBeCloseTo(116.666, 2);
  });

  it("returns null averageTicket when there is no revenue in the period", async () => {
    const repo = createInMemoryFinanceRepository();

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.averageTicket).toBeNull();
  });

  it("ranks topProcedures by total revenue descending, with names resolved", async () => {
    const repo = createInMemoryFinanceRepository();
    const { consulta, curativo } = await seedAugust(repo);

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.topProcedures).toEqual([
      { procedureId: consulta.id, procedureName: "Consulta", totalAmount: 300, count: 2 },
      { procedureId: curativo.id, procedureName: "Curativo", totalAmount: 50, count: 1 },
    ]);
  });

  it("reports cancellationRate as unavailable (no Appointment data in this phase)", async () => {
    const repo = createInMemoryFinanceRepository();

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.cancellationRate).toEqual({ available: false });
  });
});
