import { describe, it, expect } from "vitest";
import { buildInstallments } from "./installments";

describe("buildInstallments", () => {
  it("divide em centavos e a última parcela absorve a diferença", () => {
    const parcels = buildInstallments(100, 3, "2026-10-10");
    expect(parcels.map((p) => p.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(parcels.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("soma exatamente o total", () => {
    const parcels = buildInstallments(1000.01, 7, "2026-01-05");
    const sum = parcels.reduce((s, p) => s + Math.round(p.amount * 100), 0);
    expect(sum).toBe(100001);
  });

  it("avança mês a mês mantendo o dia", () => {
    const parcels = buildInstallments(300, 3, "2026-10-10");
    expect(parcels.map((p) => p.dueDate)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
  });

  it("usa o último dia do mês quando o dia não existe", () => {
    const parcels = buildInstallments(300, 3, "2026-01-31");
    expect(parcels.map((p) => p.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("vira o ano", () => {
    const parcels = buildInstallments(200, 2, "2026-12-15");
    expect(parcels.map((p) => p.dueDate)).toEqual(["2026-12-15", "2027-01-15"]);
  });
});
