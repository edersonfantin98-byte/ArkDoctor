import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm font-semibold", className)}>
      <span className="h-0.5 w-3.5 rounded-full bg-primary" />
      {children}
    </div>
  );
}
