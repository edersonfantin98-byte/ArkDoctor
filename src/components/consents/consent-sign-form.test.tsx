import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSignForm } from "./consent-sign-form";

vi.mock("./pdf", () => ({
  buildConsentPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("./signature-pad", () => ({
  SignaturePad: () => <div data-testid="pad" />,
}));

describe("ConsentSignForm", () => {
  it("shows the document text", () => {
    render(
      <ConsentSignForm
        documentTitle="TCLE"
        headerLines={["Clínica X"]}
        paragraphs={["Primeiro parágrafo.", "Segundo parágrafo."]}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText("Primeiro parágrafo.")).toBeInTheDocument();
  });

  it("blocks submit when the signer name is empty", async () => {
    const onComplete = vi.fn(async () => ({ ok: true }));
    render(
      <ConsentSignForm
        documentTitle="TCLE"
        headerLines={[]}
        paragraphs={["x"]}
        defaultSignerName=""
        submitLabel="Confirmar"
        onComplete={onComplete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("Informe o nome de quem assina.")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
