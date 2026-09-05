import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RowActionsMenu } from "./row-actions";

function setup(overrides = {}) {
  const onEdit = vi.fn();
  const onConfirm = vi.fn();
  render(
    <RowActionsMenu
      actions={[{ label: "Editar dados", onSelect: onEdit }]}
      destructive={{
        label: "Excluir",
        confirmText: "Excluir Aparecida e todo o histórico?",
        confirmLabel: "Excluir",
        onConfirm,
      }}
      {...overrides}
    />,
  );
  return { onEdit, onConfirm };
}

describe("RowActionsMenu", () => {
  it("dispara a ação normal e fecha o menu", async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    await user.click(screen.getByRole("button", { name: "Ações" }));
    await user.click(await screen.findByText("Editar dados"));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("pede confirmação antes de destruir", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Ações" }));
    await user.click(await screen.findByText("Excluir"));
    // ainda não destruiu — mostra a frase de confirmação
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText("Excluir Aparecida e todo o histórico?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("Cancelar volta para a lista sem destruir", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Ações" }));
    await user.click(await screen.findByText("Excluir"));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Editar dados")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
