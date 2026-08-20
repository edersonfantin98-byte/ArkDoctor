import { KanbanSquare, CalendarDays, Wallet, MessageCircle } from "lucide-react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const benefits = [
  { icon: KanbanSquare, text: "Pipeline de clientes, do primeiro contato ao pós-atendimento" },
  { icon: CalendarDays, text: "Agenda sem conflitos de horário" },
  { icon: Wallet, text: "Financeiro vinculado aos seus atendimentos" },
  { icon: MessageCircle, text: "WhatsApp centralizado com o histórico do cliente" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-center gap-10 bg-primary px-16 text-primary-foreground md:flex">
        <div>
          <span className="text-2xl font-bold tracking-tight">
            Ark<span className="opacity-80">Doctor</span>
          </span>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-balance">
            Seu consultório, centralizado em um só lugar.
          </h1>
        </div>
        <ul className="space-y-4">
          {benefits.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/15">
                <Icon className="size-4.5" />
              </span>
              <span className="text-sm">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex w-full items-center justify-center p-4 md:w-1/2">
        <form action={loginAction} className="w-full max-w-sm space-y-4">
          <span className="text-lg font-bold tracking-tight md:hidden">
            Ark<span className="text-primary">Doctor</span>
          </span>
          <h2 className="text-xl font-semibold">Entrar</h2>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>
      </div>
    </main>
  );
}
