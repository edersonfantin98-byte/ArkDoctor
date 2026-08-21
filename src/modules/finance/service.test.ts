import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";
import { createFinancialEntry, listFinancialEntries, getDashboardMetrics } from "./service";

describe("createFinancialEntry", () => {
  it("creates a manual expense with no procedure", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(
      repo,
      "acc-1",
      {
        type: "expense",
        amount: 80,
        category: "Material",
        occurredAt: "2026-08-15",
      },
      null,
    );

    expect(entry.type).toBe("expense");
    expect(entry.procedureId).toBeNull();
    expect(entry.defaultAmount).toBeNull();
  });

  it("rejects an expense with a procedureId", async () => {
    const repo = createInMemoryFinanceRepository();

    await expect(
      createFinancialEntry(
        repo,
        "acc-1",
        {
          type: "expense",
          amount: 80,
          category: "Material",
          procedureId: "11111111-1111-4111-8111-111111111111",
          occurredAt: "2026-08-15",
        },
        { defaultPrice: 150 },
      ),
    ).rejects.toThrow();
  });

  it("rejects an expense with no category", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(
      createFinancialEntry(
        repo,
        "acc-1",
        { type: "expense", amount: 80, occurredAt: "2026-08-15" },
        null,
      ),
    ).rejects.toThrow();
  });

  it("snapshots defaultAmount from the linked procedure's default price", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 120, procedureId: "11111111-1111-4111-8111-111111111111", category: "Atendimento", occurredAt: "2026-08-15" },
      { defaultPrice: 150 },
    );

    expect(entry.amount).toBe(120);
    expect(entry.defaultAmount).toBe(150);
    expect(entry.category).toBe("Atendimento");
  });

  it("passes an explicit category through unchanged when a procedure is linked", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(
      repo,
      "acc-1",
      {
        type: "revenue",
        amount: 120,
        procedureId: "11111111-1111-4111-8111-111111111111",
        category: "Promoção",
        occurredAt: "2026-08-15",
      },
      { defaultPrice: 150 },
    );

    expect(entry.category).toBe("Promoção");
  });

  it("allows revenue with no linked procedure, as long as it has a category", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(
      repo,
      "acc-1",
      {
        type: "revenue",
        amount: 50,
        category: "Avulso",
        occurredAt: "2026-08-15",
      },
      null,
    );

    expect(entry.procedureId).toBeNull();
    expect(entry.defaultAmount).toBeNull();
  });
});

describe("listFinancialEntries", () => {
  it("delegates to the repository", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(
      repo,
      "acc-1",
      {
        type: "revenue",
        amount: 100,
        category: "Avulso",
        occurredAt: "2026-08-15",
      },
      null,
    );

    const entries = await listFinancialEntries(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });
    expect(entries).toHaveLength(1);
  });
});

describe("getDashboardMetrics", () => {
  async function seedAugust(repo: ReturnType<typeof createInMemoryFinanceRepository>) {
    const consultaId = "22222222-2222-4222-8222-222222222222";
    const curativoId = "33333333-3333-4333-8333-333333333333";

    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 150, procedureId: consultaId, occurredAt: "2026-08-05" },
      { defaultPrice: 150 },
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 150, procedureId: consultaId, occurredAt: "2026-08-10" },
      { defaultPrice: 150 },
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 50, procedureId: curativoId, occurredAt: "2026-08-12" },
      { defaultPrice: 50 },
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 100, category: "Material", occurredAt: "2026-08-20" },
      null,
    );

    return {
      consulta: { id: consultaId, name: "Consulta" },
      curativo: { id: curativoId, name: "Curativo" },
    };
  }

  it("sums revenue, expense, and balance for the period", async () => {
    const repo = createInMemoryFinanceRepository();
    const { consulta, curativo } = await seedAugust(repo);

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [consulta, curativo],
    );

    expect(metrics.revenueTotal).toBe(350);
    expect(metrics.expenseTotal).toBe(100);
    expect(metrics.balance).toBe(250);
  });

  it("computes revenueChangePct against the equivalent-length prior period", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 100, category: "Avulso", occurredAt: "2026-07-15" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 150, category: "Avulso", occurredAt: "2026-08-15" },
      null,
    );

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.revenueChangePct).toBe(50);
  });

  it("returns null revenueChangePct when the prior period had no revenue", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 150, category: "Avulso", occurredAt: "2026-08-15" },
      null,
    );

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.revenueChangePct).toBeNull();
  });

  it("computes averageTicket over revenue entries only", async () => {
    const repo = createInMemoryFinanceRepository();
    const { consulta, curativo } = await seedAugust(repo);

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [consulta, curativo],
    );

    // (150 + 150 + 50) / 3 revenue entries
    expect(metrics.averageTicket).toBeCloseTo(116.666, 2);
  });

  it("returns null averageTicket when there is no revenue in the period", async () => {
    const repo = createInMemoryFinanceRepository();

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.averageTicket).toBeNull();
  });

  it("ranks topProcedures by total revenue descending, with names resolved", async () => {
    const repo = createInMemoryFinanceRepository();
    const { consulta, curativo } = await seedAugust(repo);

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [consulta, curativo],
    );

    expect(metrics.topProcedures).toEqual([
      { procedureId: consulta.id, procedureName: "Consulta", totalAmount: 300, count: 2 },
      { procedureId: curativo.id, procedureName: "Curativo", totalAmount: 50, count: 1 },
    ]);
  });

  it("reports cancellationRate as unavailable (no Appointment data in this phase)", async () => {
    const repo = createInMemoryFinanceRepository();

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.cancellationRate).toEqual({ available: false });
  });

  it("rejects an inverted period (from after to)", async () => {
    const repo = createInMemoryFinanceRepository();

    await expect(
      getDashboardMetrics(repo, "acc-1", { from: "2026-08-31", to: "2026-08-01" }, []),
    ).rejects.toThrow();
  });
});
