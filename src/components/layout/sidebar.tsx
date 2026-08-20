"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KanbanSquare,
  CalendarDays,
  Wallet,
  MessageCircle,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logoutAction } from "@/app/(app)/actions";

const modules = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: false },
  { label: "Pipeline", href: "/pipeline", icon: KanbanSquare, enabled: true },
  { label: "Agenda", href: "/agenda", icon: CalendarDays, enabled: false },
  { label: "Financeiro", href: "/financeiro", icon: Wallet, enabled: true },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, enabled: false },
  { label: "Configurações", href: "/configuracoes", icon: Settings, enabled: false },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-6">
        <span className="text-lg font-bold tracking-tight">
          Ark<span className="text-primary">Doctor</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {modules.map(({ label, href, icon: Icon, enabled }) => {
          const isActive = enabled && pathname.startsWith(href);

          if (!enabled) {
            return (
              <div
                key={href}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sidebar-foreground/40"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="size-4" />
                  {label}
                </span>
                <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  em breve
                </span>
              </div>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <form
        action={logoutAction}
        className="flex items-center gap-2 border-t border-sidebar-border px-3 py-4"
      >
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate text-xs text-sidebar-foreground/70">{userEmail}</span>
        <button
          type="submit"
          aria-label="Sair"
          className="rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </aside>
  );
}
