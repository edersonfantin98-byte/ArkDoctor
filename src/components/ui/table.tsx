import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, children, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "bg-muted px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TR({
  className,
  selected,
  ...props
}: ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      data-selected={selected ? "true" : undefined}
      className={cn(
        "group/row border-t border-border first:border-t-0 hover:bg-muted/40 data-[selected=true]:bg-primary/8",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3.5 py-2.5 align-middle", className)} {...props} />;
}

export function RowActionsCell({
  forceVisible,
  children,
}: {
  forceVisible?: boolean;
  children: React.ReactNode;
}) {
  return (
    <td className="w-13 px-2 text-right">
      <div
        data-force={forceVisible ? "true" : undefined}
        className="flex justify-end opacity-0 transition-opacity group-hover/row:opacity-100 data-[force=true]:opacity-100"
      >
        {children}
      </div>
    </td>
  );
}
