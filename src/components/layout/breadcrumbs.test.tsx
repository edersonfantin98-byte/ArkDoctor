import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  const items = [
    { label: "Pacientes", href: "/pacientes" },
    { label: "Aparecida de Souza", href: "/pacientes/1" },
    { label: "Tratamento" },
  ];

  it("liga todos os itens menos o último", () => {
    render(<Breadcrumbs items={items} />);
    expect(screen.getByRole("link", { name: "Pacientes" })).toHaveAttribute("href", "/pacientes");
    expect(screen.getByRole("link", { name: "Aparecida de Souza" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tratamento" })).toBeNull();
  });

  it("marca o último item como atual", () => {
    render(<Breadcrumbs items={items} />);
    expect(screen.getByText("Tratamento")).toHaveClass("font-semibold");
  });
});
