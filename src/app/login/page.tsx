import { KanbanSquare, CalendarDays, Wallet, MessageCircle } from "lucide-react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const benefits = [
  {
    icon: KanbanSquare,
    title: "Pipeline de pacientes",
    text: "Acompanhe cada contato do primeiro atendimento à conclusão.",
  },
  {
    icon: CalendarDays,
    title: "Agenda sem conflitos",
    text: "Disponibilidade, bloqueios e confirmações em um calendário só.",
  },
  {
    icon: Wallet,
    title: "Financeiro vinculado",
    text: "Receita e despesa conectadas aos seus atendimentos.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp centralizado",
    text: "Converse com pacientes sem sair do sistema.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-center gap-10 bg-primary px-16 py-14 text-primary-foreground md:flex">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance">
              Sua clínica organizada, do primeiro contato ao pós-consulta.
            </h1>
          </div>
          <ul className="space-y-4">
            {benefits.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/15">
                  <Icon className="size-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-primary-foreground/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex w-full items-center justify-center bg-card p-10">
          <form action={loginAction} className="w-full max-w-sm space-y-4">
            <div className="mb-2 flex flex-col items-center gap-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/arkdoctor-mark-solid.png" alt="ArkDoctor" className="h-8 w-auto" />
              <div>
                <h2 className="text-xl font-semibold">Entrar</h2>
                <p className="text-sm text-muted-foreground">Acesse o painel da sua clínica.</p>
              </div>
            </div>
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
      </div>
    </main>
  );
}
