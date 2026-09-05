import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renderiza título e descrição", () => {
    render(<PageHeader title="Pacientes" description="Cadastro e histórico" />);
    expect(screen.getByRole("heading", { name: "Pacientes" })).toBeInTheDocument();
    expect(screen.getByText("Cadastro e histórico")).toBeInTheDocument();
  });

  it("renderiza o eyebrow quando fornecido", () => {
    render(<PageHeader title="Inbox" eyebrow="Atendimento" />);
    expect(screen.getByText("Atendimento")).toBeInTheDocument();
  });

  it("não renderiza eyebrow quando ausente", () => {
    const { container } = render(<PageHeader title="Inbox" />);
    expect(container.querySelector("[data-slot=eyebrow]")).toBeNull();
  });
});
