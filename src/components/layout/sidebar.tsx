"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Filter,
  CalendarDays,
  CalendarPlus,
  DollarSign,
  MessageCircle,
  ClipboardList,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logoutAction } from "@/app/(app)/actions";

const generalModules = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Pipeline", href: "/pipeline", icon: Filter, enabled: true },
  { label: "Agenda", href: "/agenda", icon: CalendarDays, enabled: true },
  { label: "Procedimentos", href: "/procedimentos", icon: ClipboardList, enabled: true },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign, enabled: true },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, enabled: true },
];
const patientModules = [
  { label: "Agendamento", href: "/agendamento", icon: CalendarPlus, enabled: true },
];

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: { label: string; href: string; icon: typeof LayoutDashboard; enabled: boolean }[];
  pathname: string;
}) {
  return (
    <div className="mb-4">
      <p className="px-3 pb-2 font-mono text-[10px] font-bold tracking-[0.18em] text-sidebar-foreground/30 uppercase">
        {label}
      </p>
      {items.map(({ label, href, icon: Icon, enabled }) => {
        const isActive = enabled && (pathname === href || pathname.startsWith(href + "/"));

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
              <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] whitespace-nowrap uppercase tracking-wide">
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
    </div>
  );
}

export function Sidebar({ userEmail, accountName }: { userEmail: string; accountName: string }) {
  const pathname = usePathname();
  const initials = accountName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <aside className="flex w-[232px] shrink-0 flex-col bg-sidebar text-sidebar-foreground print:hidden">
      <div className="flex justify-center px-5 pt-6 pb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/arkdoctor-mark.webp" alt="ArkDoctor" className="h-9 w-auto" />
      </div>

      <nav className="flex-1 px-3">
        <NavGroup label="Geral" items={generalModules} pathname={pathname} />
        <NavGroup label="Paciente" items={patientModules} pathname={pathname} />
      </nav>

      <form
        action={logoutAction}
        className="flex items-center gap-2 border-t border-sidebar-border px-3 py-4"
      >
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-sidebar-foreground">{accountName}</span>
          <span className="block truncate text-xs text-sidebar-foreground/60">{userEmail}</span>
        </span>
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
