import { describe, it, expect } from "vitest";
import { formatCurrency } from "./format";

const NBSP = " ";

describe("formatCurrency", () => {
  it("formats whole reais with pt-BR thousands separator and no decimals", () => {
    expect(formatCurrency(38240)).toBe(`R$${NBSP}38.240`);
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe(`R$${NBSP}0`);
  });

  it("rounds fractional cents to the nearest whole real", () => {
    expect(formatCurrency(233.5)).toBe(`R$${NBSP}234`);
    expect(formatCurrency(233.4)).toBe(`R$${NBSP}233`);
  });

  it("formats small values without a thousands separator", () => {
    expect(formatCurrency(250)).toBe(`R$${NBSP}250`);
  });
});
