import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-6">
      <div className="space-y-1.5">
        {eyebrow && (
          <p
            data-slot="eyebrow"
            className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.18em] text-muted-foreground uppercase"
          >
            <span className="h-0.5 w-5 rounded-full bg-primary" />
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
