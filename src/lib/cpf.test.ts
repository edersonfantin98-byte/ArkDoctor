import { describe, it, expect } from "vitest";
import { isValidCpf } from "./cpf";

describe("isValidCpf", () => {
  it("accepts a valid CPF with only digits", () => {
    expect(isValidCpf("12345678909")).toBe(true);
  });

  it("accepts a valid CPF with the usual punctuation", () => {
    expect(isValidCpf("123.456.789-09")).toBe(true);
  });

  it("rejects a CPF with wrong check digits", () => {
    expect(isValidCpf("12345678900")).toBe(false);
  });

  it("rejects values without 11 digits", () => {
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("123456789012")).toBe(false);
  });

  it("rejects a CPF with all repeated digits", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejects empty or blank input", () => {
    expect(isValidCpf("")).toBe(false);
    expect(isValidCpf("   ")).toBe(false);
  });
});
