import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-primary" />
          <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-primary uppercase">
            {eyebrow}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
