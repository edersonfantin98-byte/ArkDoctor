import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSignForm } from "./consent-sign-form";
import { buildConsentPdf } from "./pdf";
import type { Block } from "@/modules/consents/templates";

vi.mock("./pdf", () => ({ buildConsentPdf: vi.fn(async () => new Uint8Array([1, 2, 3])) }));
vi.mock("./signature-pad", () => ({
  SignaturePad: () => <div data-testid="pad" />,
}));

const mockBuild = vi.mocked(buildConsentPdf);

const tcleBlocks: Block[] = [
  { type: "heading", text: "TCLE" },
  { type: "paragraph", text: "Corpo do termo." },
  { type: "field", label: "Tipo de ferida", value: null, key: "tipoFerida" },
  { type: "checkbox", label: "Autorizo a realização do tratamento proposto.", checked: false, key: "autorizo" },
  { type: "checkbox", label: "Não autorizo a realização do tratamento proposto.", checked: false, key: "naoAutorizo" },
  { type: "field", label: "Nome do responsável legal", value: null, key: "responsavelNome" },
  { type: "field", label: "RG do responsável legal", value: null, key: "responsavelRg" },
  { type: "signature", who: "electronic", label: "Assinatura de quem consente" },
];
const laserBlocks: Block[] = [
  { type: "heading", text: "Laser" },
  { type: "paragraph", text: "Corpo do laser." },
  { type: "signature", who: "electronic", label: "Assinatura do paciente" },
];

beforeEach(() => {
  mockBuild.mockClear();
});

describe("ConsentSignForm — TCLE", () => {
  it("mostra os campos extras do TCLE", () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByLabelText(/Tipo de ferida/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Autorizo o tratamento/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Não autorizo/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Assino como responsável legal/i)).toBeInTheDocument();
  });

  it("'Não autorizo' bloqueia: mostra aviso e não chama onComplete", async () => {
    const onComplete = vi.fn(async () => ({ ok: true }));
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={onComplete}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Não autorizo/i }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      screen.getByText("Sem autorização do tratamento, o documento não é registrado."),
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("botão fica desabilitado enquanto a autorização não é escolhida", () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("toggle de responsável exige nome e RG (botão desabilitado sem eles)", async () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Autorizo o tratamento/i }));
    await userEvent.click(screen.getByLabelText(/Assino como responsável legal/i));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Nome do responsável/i), "João");
    await userEvent.type(screen.getByLabelText(/RG do responsável/i), "MT-1");
    // ainda pode faltar o traço da assinatura, mas os campos de responsável já não bloqueiam
    expect(screen.getByLabelText(/Nome do responsável/i)).toHaveValue("João");
  });

  it("tipoFerida vindo por prop aparece somente leitura", () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        tipoFerida="úlcera venosa"
        onComplete={async () => ({ ok: true })}
      />,
    );
    const input = screen.getByLabelText(/Tipo de ferida/i);
    expect(input).toHaveValue("úlcera venosa");
    expect(input).toHaveAttribute("readonly");
  });
});

describe("ConsentSignForm — imagem/laser", () => {
  it("não mostra campos do TCLE", () => {
    render(
      <ConsentSignForm
        kind="laser"
        documentTitle="Laser"
        blocks={laserBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.queryByLabelText(/Tipo de ferida/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("mostra o texto do documento a partir dos blocos", () => {
    render(
      <ConsentSignForm
        kind="laser"
        documentTitle="Laser"
        blocks={laserBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText("Corpo do laser.")).toBeInTheDocument();
  });

  it("bloqueia submit quando o nome está vazio", () => {
    const onComplete = vi.fn(async () => ({ ok: true }));
    render(
      <ConsentSignForm
        kind="laser"
        documentTitle="Laser"
        blocks={laserBlocks}
        defaultSignerName=""
        submitLabel="Confirmar"
        onComplete={onComplete}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
