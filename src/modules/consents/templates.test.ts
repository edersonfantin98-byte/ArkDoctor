import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  applyTcleFields,
  applyDocFields,
  ageFromIsoDate,
  PATIENT_DOC_KEYS,
  formatBrDate,
  formatBrDateTime,
  type Block,
  type TemplateContext,
} from "./templates";
import { CONSENT_KINDS } from "./schemas";

const ctx: TemplateContext = {
  pacienteNome: "Maria Silva",
  pacienteCpf: "123.456.789-00",
  pacienteNascimento: "1980-05-09",
  pacienteTelefone: "(66) 90000-0000",
  pacienteRg: "MT-1234567",
  pacienteEndereco: "Rua das Acácias, 200",
  pacienteCidadeUf: "Cuiabá / MT",
  pacienteIdade: "45",
  clinicaNome: "Clínica Silvana Lopes",
  profissionalNome: "Silvana Lopes",
  profissionalConselho: "COREN-MT 481743",
  data: "12/03/2026",
};

function types(blocks: Block[]): string[] {
  return blocks.map((b) => b.type);
}
function byKey(blocks: Block[], key: string): Block | undefined {
  return blocks.find((b) => (b.type === "field" || b.type === "checkbox") && b.key === key);
}

describe("CONSENT_KINDS", () => {
  it("são exatamente tcle, imagem e laser, nesta ordem", () => {
    expect(CONSENT_KINDS).toEqual(["tcle", "imagem", "laser"]);
  });
});

describe("renderTemplate", () => {
  it("tcle: título + primeiro bloco heading + campos + assinaturas", () => {
    const { title, blocks } = renderTemplate("tcle", ctx);
    expect(title).toMatch(/Tratamento de Feridas/);
    expect(blocks[0]).toEqual({ type: "heading", text: expect.stringMatching(/Consentimento/i) });

    const nome = blocks.find((b) => b.type === "field" && b.label === "Nome");
    expect(nome).toMatchObject({ type: "field", value: "Maria Silva" });

    const sigs = blocks.filter((b) => b.type === "signature");
    expect(sigs.map((s) => (s as Extract<Block, { type: "signature" }>).who)).toEqual([
      "electronic",
      "fixed",
    ]);
  });

  it("tcle: tipo de ferida e autorização entram por ctx", () => {
    const { blocks } = renderTemplate("tcle", { ...ctx, tipoFerida: "úlcera venosa", autoriza: true });
    expect(byKey(blocks, "tipoFerida")).toMatchObject({ value: "úlcera venosa" });
    expect(byKey(blocks, "autorizo")).toMatchObject({ checked: true });
    expect(byKey(blocks, "naoAutorizo")).toMatchObject({ checked: false });
  });

  it("tcle: campos sem valor viram field com value null", () => {
    const { blocks } = renderTemplate("tcle", { ...ctx, pacienteEndereco: null });
    const endereco = blocks.find((b) => b.type === "field" && b.label === "Endereço residencial");
    expect(endereco).toMatchObject({ value: null });
    expect(byKey(blocks, "tipoFerida")).toMatchObject({ value: null });
  });

  it("tcle: RG, endereço, cidade/UF e idade entram por ctx", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const field = (label: string) => blocks.find((b) => b.type === "field" && b.label === label);
    expect(field("Endereço residencial")).toMatchObject({ value: "Rua das Acácias, 200" });
    expect(field("Idade")).toMatchObject({ value: "45" });
  });

  it("imagem: RG, endereço e município/UF do paciente entram por ctx", () => {
    const { blocks } = renderTemplate("imagem", ctx);
    const field = (label: string) => blocks.find((b) => b.type === "field" && b.label === label);
    expect(field("RG")).toMatchObject({ value: "MT-1234567" });
    expect(field("Endereço")).toMatchObject({ value: "Rua das Acácias, 200" });
    expect(field("Município / UF")).toMatchObject({ value: "Cuiabá / MT" });
  });

  it("assinatura da profissional é fixa (who: 'fixed') nos 3 termos", () => {
    for (const kind of ["tcle", "imagem", "laser"] as const) {
      const { blocks } = renderTemplate(kind, ctx);
      const sigs = blocks.filter(
        (b): b is Extract<Block, { type: "signature" }> => b.type === "signature",
      );
      expect(sigs.at(-1)?.who).toBe("fixed");
      expect(sigs.filter((s) => s.who === "fixed")).toHaveLength(1);
    }
  });

  it("imagem: sem campos preenchidos por enfermeira; CNPJ no corpo; 2 assinaturas", () => {
    const { title, blocks } = renderTemplate("imagem", ctx);
    expect(title).toMatch(/Imagem e Voz/);
    expect(byKey(blocks, "tipoFerida")).toBeUndefined();
    expect(byKey(blocks, "autorizo")).toBeUndefined();
    const corpo = blocks.filter((b) => b.type === "paragraph").map((b) => (b as Extract<Block, { type: "paragraph" }>).text).join("\n");
    expect(corpo).toContain("31.693.471/0001-56");
    expect(corpo).toContain("CICATRIZE MAIS FERIDAS");
    expect(blocks.filter((b) => b.type === "signature")).toHaveLength(2);
  });

  it("laser: sem campos de enfermeira; 2 assinaturas; corpo menciona laserterapia", () => {
    const { title, blocks } = renderTemplate("laser", ctx);
    expect(title).toMatch(/Laserterapia/);
    expect(byKey(blocks, "autorizo")).toBeUndefined();
    const corpo = blocks.filter((b) => b.type === "paragraph").map((b) => (b as Extract<Block, { type: "paragraph" }>).text).join("\n");
    expect(corpo).toMatch(/laserterapia/i);
    expect(blocks.filter((b) => b.type === "signature")).toHaveLength(2);
  });

  it("data de nascimento é formatada DD/MM/AAAA no field", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const nasc = blocks.find((b) => b.type === "field" && b.label === "Data de nascimento");
    expect(nasc).toMatchObject({ value: "09/05/1980" });
  });
});

describe("applyTcleFields", () => {
  it("funde tipo de ferida, autorização e responsável nos blocos com key", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const out = applyTcleFields(blocks, {
      tipoFerida: "deiscência cirúrgica",
      autoriza: true,
      responsavelNome: "João Silva",
      responsavelRg: "MT-1234567",
      responsavelTelefone: "(66) 98888-0000",
    });
    expect(byKey(out, "tipoFerida")).toMatchObject({ value: "deiscência cirúrgica" });
    expect(byKey(out, "autorizo")).toMatchObject({ checked: true });
    expect(byKey(out, "responsavelNome")).toMatchObject({ value: "João Silva" });
    expect(byKey(out, "responsavelRg")).toMatchObject({ value: "MT-1234567" });
    expect(byKey(out, "responsavelTelefone")).toMatchObject({ value: "(66) 98888-0000" });
    expect(byKey(out, "assinaComoResponsavel")).toMatchObject({ checked: true });
    expect(byKey(out, "assinaComoPaciente")).toMatchObject({ checked: false });
  });

  it("sem responsável: marca 'assina como paciente' e deixa os campos de responsável null", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const out = applyTcleFields(blocks, {
      tipoFerida: "x",
      autoriza: true,
      responsavelNome: null,
      responsavelRg: null,
    });
    expect(byKey(out, "assinaComoPaciente")).toMatchObject({ checked: true });
    expect(byKey(out, "assinaComoResponsavel")).toMatchObject({ checked: false });
    expect(byKey(out, "responsavelNome")).toMatchObject({ value: null });
  });

  it("não toca em blocos sem key (parágrafos, headings)", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const out = applyTcleFields(blocks, { tipoFerida: "x", autoriza: true, responsavelNome: null, responsavelRg: null });
    expect(types(out)).toEqual(types(blocks));
    expect(out.filter((b) => b.type === "paragraph")).toEqual(blocks.filter((b) => b.type === "paragraph"));
  });
});

describe("applyDocFields", () => {
  it("os campos de documento do paciente têm key nos 3 termos", () => {
    const imagem = renderTemplate("imagem", { ...ctx, pacienteRg: null, pacienteEndereco: null, pacienteCidadeUf: null }).blocks;
    const keyed = imagem.filter(
      (b): b is Extract<Block, { type: "field" }> => b.type === "field" && !!b.key,
    );
    const keys = keyed.map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(["pacienteRg", "pacienteCpf", "pacienteEndereco", "pacienteCidadeUf"]));
    for (const k of keys) {
      if (k && k.startsWith("paciente")) expect(PATIENT_DOC_KEYS).toContain(k);
    }
  });

  it("funde valores por key e limpa com string vazia", () => {
    const blocks = renderTemplate("imagem", { ...ctx, pacienteRg: null }).blocks;
    const out = applyDocFields(blocks, { pacienteRg: "MT-999", pacienteEndereco: "" });
    const field = (label: string) => out.find((b) => b.type === "field" && b.label === label);
    expect(field("RG")).toMatchObject({ value: "MT-999" });
    expect(field("Endereço")).toMatchObject({ value: null });
    expect(field("CPF")).toMatchObject({ value: "123.456.789-00" }); // não tocado
  });
});

describe("ageFromIsoDate", () => {
  const ref = new Date(2026, 4, 10); // 10/05/2026
  it("anos completos, antes e depois do aniversário no ano", () => {
    expect(ageFromIsoDate("1980-05-09", ref)).toBe(46);
    expect(ageFromIsoDate("1980-05-11", ref)).toBe(45);
  });
  it("data inválida ou ausente vira null", () => {
    expect(ageFromIsoDate(null, ref)).toBeNull();
    expect(ageFromIsoDate("", ref)).toBeNull();
    expect(ageFromIsoDate("09/05/1980", ref)).toBeNull();
  });
});

describe("date formatters", () => {
  it("formata data como DD/MM/AAAA no fuso da clínica", () => {
    expect(formatBrDate(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026");
  });
  it("formata data-hora como DD/MM/AAAA HH:mm no fuso da clínica", () => {
    expect(formatBrDateTime(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026 09:05");
  });
  it("volta ao dia anterior quando o UTC passou da meia-noite", () => {
    expect(formatBrDateTime(new Date("2026-03-10T02:30:00Z"))).toBe("09/03/2026 22:30");
  });
});
