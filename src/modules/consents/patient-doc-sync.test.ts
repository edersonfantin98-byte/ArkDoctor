import { describe, it, expect } from "vitest";
import { docFieldsToContactUpdate } from "./patient-doc-sync";

describe("docFieldsToContactUpdate", () => {
  it("mapeia as keys do template para as colunas do contato", () => {
    expect(
      docFieldsToContactUpdate({
        pacienteCpf: "123.456.789-00",
        pacienteRg: "MT-1234567",
        pacienteEndereco: "Rua A, 10",
        pacienteCidadeUf: "Cuiabá / MT",
      }),
    ).toEqual({
      cpf: "123.456.789-00",
      rg: "MT-1234567",
      address: "Rua A, 10",
      cityState: "Cuiabá / MT",
    });
  });

  it("omite campos vazios ou só com espaços (não apaga o cadastro)", () => {
    expect(docFieldsToContactUpdate({ pacienteRg: "MT-1", pacienteEndereco: "   " })).toEqual({
      rg: "MT-1",
    });
  });
});
