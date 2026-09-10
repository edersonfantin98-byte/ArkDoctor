import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renderiza título e descrição", () => {
    render(<PageHeader title="Pacientes" description="Cadastro e histórico" />);
    expect(screen.getByRole("heading", { name: "Pacientes" })).toBeInTheDocument();
    expect(screen.getByText("Cadastro e histórico")).toBeInTheDocument();
  });
});
