export function SelectionBar({
  count,
  actionLabel,
  onAction,
  onClear,
}: {
  count: number;
  actionLabel: string;
  onAction: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-foreground px-4 py-2 text-sm text-background">
      <b className="font-semibold">
        {count} selecionado{count === 1 ? "" : "s"}
      </b>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onAction}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        {actionLabel}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md bg-background/15 px-3 py-1.5 text-xs font-semibold text-background"
      >
        Limpar seleção
      </button>
    </div>
  );
}
