"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  LayoutDashboard,
  Filter,
  CalendarDays,
  CalendarPlus,
  DollarSign,
  MessageCircle,
  ClipboardList,
  LogOut,
  Menu,
  Users,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logoutAction } from "@/app/(app)/actions";

const generalModules = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign, enabled: true },
  { label: "Agenda", href: "/agenda", icon: CalendarDays, enabled: true },
];
const atendimentoModules = [
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, enabled: true },
  { label: "Pipeline", href: "/pipeline", icon: Filter, enabled: true },
];
const clinicaModules = [
  { label: "Pacientes", href: "/pacientes", icon: Users, enabled: true },
  { label: "Procedimentos", href: "/procedimentos", icon: ClipboardList, enabled: true },
  { label: "Agendamento", href: "/agendamento", icon: CalendarPlus, enabled: true },
  { label: "Configurações", href: "/configuracoes", icon: Settings, enabled: true },
];

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: { label: string; href: string; icon: typeof LayoutDashboard; enabled: boolean }[];
  pathname: string;
  onNavigate?: () => void;
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
            onClick={onNavigate}
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

function NavBody({
  userEmail,
  accountName,
  onNavigate,
}: {
  userEmail: string;
  accountName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const initials = accountName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3">
        <NavGroup label="Geral" items={generalModules} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup
          label="Atendimento"
          items={atendimentoModules}
          pathname={pathname}
          onNavigate={onNavigate}
        />
        <NavGroup label="Clínica" items={clinicaModules} pathname={pathname} onNavigate={onNavigate} />
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
    </>
  );
}

export function Sidebar({ userEmail, accountName }: { userEmail: string; accountName: string }) {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex print:hidden">
      <div className="flex justify-center px-5 pt-6 pb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/arkdoctor-mark.webp" alt="ArkDoctor" className="h-9 w-auto" />
      </div>
      <NavBody userEmail={userEmail} accountName={accountName} />
    </aside>
  );
}

export function MobileNav({ userEmail, accountName }: { userEmail: string; accountName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fecha o drawer quando a rota muda por fora dos links (voltar do navegador); o clique no link já fecha via onNavigate
    setOpen(false);
  }, [pathname]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground lg:hidden print:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger
          aria-label="Abrir menu"
          className="rounded-lg p-2 hover:bg-sidebar-accent"
        >
          <Menu className="size-5" />
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 lg:hidden print:hidden" />
          <DialogPrimitive.Popup
            aria-label="Menu de navegação"
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[82%] flex-col bg-sidebar text-sidebar-foreground outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left lg:hidden print:hidden"
          >
            <div className="flex items-center justify-between px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/arkdoctor-mark.webp" alt="ArkDoctor" className="h-7 w-auto" />
              <DialogPrimitive.Close
                aria-label="Fechar menu"
                className="rounded-lg p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
            <NavBody
              userEmail={userEmail}
              accountName={accountName}
              onNavigate={() => setOpen(false)}
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/arkdoctor-mark.webp" alt="ArkDoctor" className="h-7 w-auto" />
    </header>
  );
}
