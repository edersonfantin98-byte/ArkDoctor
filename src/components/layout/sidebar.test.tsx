import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/agenda",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string | { pathname: string };
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <a
      href={typeof href === "string" ? href : "#"}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/app/(app)/actions", () => ({
  logoutAction: vi.fn(),
}));

import { MobileNav } from "./sidebar";

function renderMobileNav() {
  return render(<MobileNav userEmail="silvana@arkdoctor.com" accountName="Enfermeira Silvana" />);
}

describe("MobileNav", () => {
  it("com o drawer fechado, mostra só o botão de abrir e nenhum item de menu", () => {
    renderMobileNav();
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pacientes" })).not.toBeInTheDocument();
  });

  it("o hambúrguer abre o drawer com todos os grupos de navegação", async () => {
    const user = userEvent.setup();
    renderMobileNav();
    await user.click(screen.getByRole("button", { name: "Abrir menu" }));

    expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pacientes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurações" })).toBeInTheDocument();
  });

  it("tocar num item do menu fecha o drawer", async () => {
    const user = userEvent.setup();
    renderMobileNav();
    await user.click(screen.getByRole("button", { name: "Abrir menu" }));
    await user.click(await screen.findByRole("link", { name: "Pacientes" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Pacientes" })).not.toBeInTheDocument(),
    );
  });

  it("o botão Fechar menu fecha o drawer", async () => {
    const user = userEvent.setup();
    renderMobileNav();
    await user.click(screen.getByRole("button", { name: "Abrir menu" }));
    await user.click(await screen.findByRole("button", { name: "Fechar menu" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Pacientes" })).not.toBeInTheDocument(),
    );
  });
});
