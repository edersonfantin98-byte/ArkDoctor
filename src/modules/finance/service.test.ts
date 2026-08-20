import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";
import { createProcedure, updateProcedure, deactivateProcedure, listProcedures, getProcedureDefaults } from "./service";

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
