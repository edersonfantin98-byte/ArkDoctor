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
