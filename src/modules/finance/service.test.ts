import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";
import {
  createFinancialEntry,
  listFinancialEntries,
  getDashboardMetrics,
  getFinancialEntryByAppointmentId,
  createInstallmentPurchase,
  getInstallmentPlanSummary,
  deleteInstallmentPlanEntries,
} from "./service";

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

  it("links the entry to an appointment when appointmentId is given", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(
      repo,
      "acc-1",
      {
        type: "revenue",
        amount: 120,
        procedureId: "11111111-1111-4111-8111-111111111111",
        appointmentId: "44444444-4444-4444-8444-444444444444",
        category: "Atendimento",
        occurredAt: "2026-08-15",
      },
      { defaultPrice: 150 },
    );

    expect(entry.appointmentId).toBe("44444444-4444-4444-8444-444444444444");
  });
});

describe("getFinancialEntryByAppointmentId", () => {
  it("returns the entry linked to the given appointment", async () => {
    const repo = createInMemoryFinanceRepository();
    const created = await createFinancialEntry(
      repo,
      "acc-1",
      {
        type: "revenue",
        amount: 120,
        appointmentId: "44444444-4444-4444-8444-444444444444",
        category: "Atendimento",
        occurredAt: "2026-08-15",
      },
      null,
    );

    const found = await getFinancialEntryByAppointmentId(
      repo,
      "acc-1",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(found?.id).toBe(created.id);
  });

  it("returns null when no entry is linked to the appointment", async () => {
    const repo = createInMemoryFinanceRepository();

    const found = await getFinancialEntryByAppointmentId(
      repo,
      "acc-1",
      "55555555-5555-4555-8555-555555555555",
    );

    expect(found).toBeNull();
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

  it("groups expenses by category, sorted by total descending", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 100, category: "Material", occurredAt: "2026-08-05" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 300, category: "Aluguel", occurredAt: "2026-08-10" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 50, category: "Material", occurredAt: "2026-08-15" },
      null,
    );
    // revenue entries must not appear in the expense breakdown
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 999, category: "Atendimento", occurredAt: "2026-08-16" },
      null,
    );

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.expenseByCategory).toEqual([
      { category: "Aluguel", total: 300 },
      { category: "Material", total: 150 },
    ]);
  });

  it("labels uncategorized expenses as Sem categoria", async () => {
    const repo = createInMemoryFinanceRepository();
    await repo.insertFinancialEntry("acc-1", {
      type: "expense",
      amount: 40,
      defaultAmount: null,
      category: null,
      procedureId: null,
      appointmentId: null,
      description: null,
      occurredAt: "2026-08-05",
    });

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.expenseByCategory).toEqual([{ category: "Sem categoria", total: 40 }]);
  });

  it("builds a 6-month revenue/expense history ending in the period's month", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 100, category: "Avulso", occurredAt: "2026-06-10" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 30, category: "Material", occurredAt: "2026-06-12" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 200, category: "Avulso", occurredAt: "2026-08-10" },
      null,
    );

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.revenueExpenseHistory).toHaveLength(6);
    expect(metrics.revenueExpenseHistory[metrics.revenueExpenseHistory.length - 1]).toEqual({
      month: "Ago",
      revenue: 200,
      expense: 0,
    });
    const june = metrics.revenueExpenseHistory.find((m) => m.month === "Jun");
    expect(june).toEqual({ month: "Jun", revenue: 100, expense: 30 });
  });
});

describe("despesas parceladas", () => {
  const input = {
    description: "Boleto fornecedor",
    category: "Material",
    totalAmount: 300,
    installments: 3,
    firstDueDate: "2026-10-10",
  };

  it("gera uma despesa por parcela com o vencimento e a descrição certos", async () => {
    const repo = createInMemoryFinanceRepository();
    const entries = await createInstallmentPurchase(repo, "acc-1", input);

    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.type === "expense" && e.planId === entries[0].planId)).toBe(true);
    expect(entries.map((e) => e.occurredAt)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(entries.map((e) => e.description)).toEqual([
      "Boleto fornecedor (1/3)",
      "Boleto fornecedor (2/3)",
      "Boleto fornecedor (3/3)",
    ]);
  });

  it("rejeita total que dá menos de 1 centavo por parcela", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(
      createInstallmentPurchase(repo, "acc-1", { ...input, totalAmount: 0.3, installments: 48 }),
    ).rejects.toThrow();
    await expect(
      createInstallmentPurchase(repo, "acc-1", { ...input, totalAmount: 0.48, installments: 48 }),
    ).resolves.toHaveLength(48);
  });

  it("cada parcela só aparece no período do seu mês", async () => {
    const repo = createInMemoryFinanceRepository();
    await createInstallmentPurchase(repo, "acc-1", input);
    const nov = await listFinancialEntries(repo, "acc-1", { from: "2026-11-01", to: "2026-11-30" });
    expect(nov).toHaveLength(1);
    expect(nov[0].installmentNumber).toBe(2);
  });

  it("rejeita 1 parcela, 49 parcelas e categoria vazia", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(createInstallmentPurchase(repo, "acc-1", { ...input, installments: 1 })).rejects.toThrow();
    await expect(createInstallmentPurchase(repo, "acc-1", { ...input, installments: 49 })).rejects.toThrow();
    await expect(createInstallmentPurchase(repo, "acc-1", { ...input, category: "" })).rejects.toThrow();
  });

  it("resumo separa vencidas e restantes", async () => {
    const repo = createInMemoryFinanceRepository();
    const [first] = await createInstallmentPurchase(repo, "acc-1", input);
    const summary = await getInstallmentPlanSummary(repo, "acc-1", first.planId!, "2026-11-15");
    expect(summary).toEqual({
      planId: first.planId,
      totalAmount: 300,
      count: 3,
      elapsedCount: 2,
      elapsedAmount: 200,
      remainingAmount: 100,
    });
  });

  it("excluir 'futuras' mantém as já vencidas", async () => {
    const repo = createInMemoryFinanceRepository();
    const [first] = await createInstallmentPurchase(repo, "acc-1", input);
    await deleteInstallmentPlanEntries(repo, "acc-1", first.planId!, "future", "2026-11-15");
    const left = await repo.listEntriesByPlan("acc-1", first.planId!);
    expect(left.map((e) => e.installmentNumber)).toEqual([1, 2]);
  });

  it("excluir 'todas' remove tudo", async () => {
    const repo = createInMemoryFinanceRepository();
    const [first] = await createInstallmentPurchase(repo, "acc-1", input);
    await deleteInstallmentPlanEntries(repo, "acc-1", first.planId!, "all", "2026-11-15");
    expect(await repo.listEntriesByPlan("acc-1", first.planId!)).toEqual([]);
  });
});
