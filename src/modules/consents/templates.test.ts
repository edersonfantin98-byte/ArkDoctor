import { describe, it, expect } from "vitest";
import { renderTemplate, formatBrDate, formatBrDateTime, type TemplateContext } from "./templates";

const ctx: TemplateContext = {
  pacienteNome: "Maria Silva",
  pacienteCpf: null,
  pacienteNascimento: null,
  clinicaNome: "Clínica Ozônio",
  profissionalNome: "Silvana Enfermeira",
  profissionalConselho: "COREN-SP 123456",
  data: "12/03/2026",
};

describe("renderTemplate", () => {
  it("replaces known placeholders", () => {
    const r = renderTemplate("tcle", ctx);
    expect(r.title).toBe("Termo de Consentimento Livre e Esclarecido");
    const joined = r.paragraphs.join("\n");
    expect(joined).toContain("Maria Silva");
    expect(joined).toContain("12/03/2026");
    expect(joined).not.toMatch(/\{\{/);
  });

  it("renders an em-dash for empty or null placeholder values", () => {
    const r = renderTemplate("imagem", { ...ctx, pacienteNome: "" });
    // `Paciente: {{pacienteNome}}` with pacienteNome === "" renders "—".
    const joined = r.paragraphs.join("\n");
    expect(joined).toContain("—");
  });

  it("leaves no unresolved token when the context is complete", () => {
    const r = renderTemplate("imagem", ctx);
    expect(r.paragraphs.join("\n")).not.toMatch(/\{\{/);
  });

  it("splits paragraphs on blank lines", () => {
    const r = renderTemplate("lgpd", ctx);
    expect(r.paragraphs.length).toBeGreaterThan(1);
    expect(r.paragraphs.every((p) => p.length > 0)).toBe(true);
  });
});

describe("date formatters", () => {
  it("formats a date as DD/MM/AAAA in the clinic time zone", () => {
    expect(formatBrDate(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026");
  });
  it("formats a datetime as DD/MM/AAAA HH:mm in the clinic time zone", () => {
    // 13:05 UTC = 09:05 in America/Cuiaba (UTC-4).
    expect(formatBrDateTime(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026 09:05");
  });
  it("rolls back to the previous calendar day when UTC is past midnight", () => {
    // 02:30 UTC on 2026-03-10 = 22:30 on 2026-03-09 in America/Cuiaba.
    expect(formatBrDateTime(new Date("2026-03-10T02:30:00Z"))).toBe("09/03/2026 22:30");
  });
});
