import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./selection-bar";

describe("SelectionBar", () => {
  it("não renderiza nada com zero selecionados", () => {
    const { container } = render(
      <SelectionBar count={0} actionLabel="Enviar mensagem" onAction={vi.fn()} onClear={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a contagem e dispara as ações", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClear = vi.fn();
    render(
      <SelectionBar count={2} actionLabel="Enviar mensagem" onAction={onAction} onClear={onClear} />,
    );
    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await user.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("usa singular com um selecionado", () => {
    render(
      <SelectionBar count={1} actionLabel="Enviar mensagem" onAction={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
  });
});
