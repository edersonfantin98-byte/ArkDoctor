# Redesenho de Telas (WhatsApp, Pacientes, Procedimentos, Configurações) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar o acabamento visual e a clareza de fluxo de 7 telas do ArkDoctor (WhatsApp Inbox, Pacientes lista, Paciente detalhe, Tratamento detalhe, Documentos/Consentimentos, Procedimentos, Configurações) sem repensar a linguagem de design — mesmo laranja, mesma sidebar escura, mesmo Inter/shadcn.

**Architecture:** Duas fases. **Fase A** cria um punhado de primitivos compartilhados que hoje não existem (menu ⋯ com confirmação inline, primitivos de tabela, barra de seleção contextual, estado vazio com chip, eyebrow no cabeçalho, breadcrumbs, meter). **Fase B** aplica esses primitivos tela por tela, portando o markup do mockup aprovado para os componentes React existentes **sem tocar em handlers, estado, props ou server actions** — só estrutura e classes. Cada tela é uma tarefa revisável isoladamente.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind CSS v4 (`@theme inline` + tokens shadcn em `src/app/globals.css`), `@base-ui/react` v1.7 para primitivos com comportamento (Dialog já usa; Menu virá daqui), `lucide-react` para ícones, `class-variance-authority` + `cn()` para variantes, Vitest para testes.

**Spec / Design reference:**
- Mockup navegável de alta fidelidade (fonte da verdade para markup e layout): `docs/superpowers/specs/2026-09-03-redesenho-telas-mockup.html` — cópia local do Artifact `https://claude.ai/code/artifact/62106672-f3e9-4696-8ec9-d5975c3e9e9d`. Abrir no navegador para ver o comportamento; ler o HTML para copiar estrutura. Seções marcadas por comentários `<!-- ============ NOME ============ -->`.
- Design system existente: `docs/superpowers/specs/2026-08-20-arkdoctor-visual-design.md`.
- Decisões travadas com o usuário (2026-09-03): elevar dentro do DS atual; dores a resolver = telas cruas/sem acabamento, fluxo confuso/ações escondidas, densidade errada; usuário viu e aprovou a direção do mockup.

## Global Constraints

- **Sem dark mode.** O mockup é light-only; não adicionar blocos `.dark` novos. Os tokens `.dark` já existentes em `globals.css` ficam como estão.
- **Não alterar lógica.** Nenhuma mudança em server actions (`src/app/(app)/**/actions.ts`), tipos de domínio (`src/modules/**`), queries ou fluxo de dados. As tarefas de tela mexem só em JSX + `className` + componentes de apresentação. Se uma tela parecer exigir mudança de dados, **parar e perguntar**.
- **Preservar todo handler/estado/prop existente.** Cada tarefa de tela lista explicitamente o que manter. `useState`, `useEffect`, `onClick`, `onChange`, chamadas de action, polling — tudo intacto.
- **Idioma:** todo texto de UI em português do Brasil. Copiar strings do mockup literalmente quando houver divergência com o texto atual (ex.: cabeçalho do WhatsApp vira "Inbox" / eyebrow "Atendimento").
- **Cor primária:** já é `oklch(0.7216 0.1904 50.15)` ≈ `#FF7900` (`--primary`). Usar `bg-primary` / `text-primary`, nunca hex cru — exceto o verde WhatsApp `#25D366`, que o DS trata como fora da paleta do tema.
- **Raios:** cards e botões `rounded-xl`/`rounded-lg` (padrão dos componentes atuais); inputs/thumbnails `rounded-md`; avatares/badges/pílulas `rounded-full`. Seguir o que o componente vizinho já faz.
- **Ícones:** `lucide-react`, `size-4` padrão (o mockup usa um sprite SVG próprio; ao portar, trocar cada `<use href="#i-xxx"/>` pelo ícone lucide equivalente — tabela de equivalência na Task 2).
- **Verificação por tarefa:** toda tarefa termina com `npm run lint` limpo, `npm run test` verde (nenhum teste existente quebrado), `npm run build` sem erro de tipo, e — nas tarefas de tela — conferência visual contra a seção correspondente do mockup.
- **Commits frequentes:** um commit por tarefa no mínimo; mensagens `feat(ui):` / `refactor(ui):` em português curto, com o rodapé de atribuição do projeto.
- **Rota de arquivos:** primitivos novos em `src/components/ui/`; helpers de apresentação específicos de layout em `src/components/layout/`. Não criar barrel files.

---

## File Structure

**Fase A — primitivos criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/app/globals.css` (modificar) | Adicionar tokens de cor semântica (`--pos/--neg/--warn/--info` + pares `-bg`) e verde WhatsApp, expostos ao Tailwind via `@theme inline`. |
| `src/components/layout/page-header.tsx` (modificar) | Adicionar `eyebrow` (tracinho laranja + label mono uppercase) ao `PageHeader`. |
| `src/components/layout/breadcrumbs.tsx` (criar) | Trilha `Pacientes › Nome › Tratamento` com tracinho laranja "você está aqui". |
| `src/components/layout/section-label.tsx` (criar) | Rótulo de seção dentro de uma tela (`•—  Tratamentos`) com tracinho curto. |
| `src/components/ui/menu.tsx` (criar) | Wrapper fino de `@base-ui/react/menu` (Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator) no estilo shadcn do projeto. |
| `src/components/ui/row-actions.tsx` (criar) | Botão ⋯ + menu com item destrutivo que abre **confirmação inline** dentro do popover (padrão do mockup). Tem lógica → testes de verdade. |
| `src/components/ui/table.tsx` (criar) | `Table/THead/TR/TH/TBody/TD` com header cinza uppercase, linha ~44px, `data-selected` para tint laranja, slot de ações que aparece no hover. |
| `src/components/ui/selection-bar.tsx` (criar) | Barra escura contextual "N selecionados · [ação] · Limpar seleção". |
| `src/components/ui/empty-state.tsx` (criar) | Estado vazio centralizado com chip laranja + ícone + texto + ação opcional. |
| `src/components/ui/meter.tsx` (criar) | Barra de progresso fina (uso de armazenamento). |
| `src/components/ui/description-list.tsx` (criar) | `DescriptionList` / `DLRow` para os pares rótulo/valor do trilho de identidade do paciente e do card "Conta". |

**Fase B — telas modificadas (só JSX/classes):**

| Arquivo | Tela |
|---|---|
| `src/components/procedures/procedures-client.tsx` + `src/app/(app)/procedimentos/page.tsx` | Procedimentos |
| `src/components/settings/settings-client.tsx` + `src/app/(app)/configuracoes/page.tsx` | Configurações |
| `src/components/whatsapp/whatsapp-client.tsx` + `src/app/(app)/whatsapp/page.tsx` | WhatsApp Inbox |
| `src/components/patients/patients-client.tsx` + `src/app/(app)/pacientes/page.tsx` | Pacientes (lista) |
| `src/components/patients/patient-detail-client.tsx` + `src/app/(app)/pacientes/[id]/page.tsx` | Paciente — detalhe |
| `src/components/treatments/treatment-detail-client.tsx` + `.../[treatmentId]/page.tsx` | Tratamento — detalhe |
| `src/components/consents/consent-cards.tsx` + `src/app/(app)/pacientes/[id]/documentos/page.tsx` | Documentos / Consentimentos |

---

## FASE A — Primitivos compartilhados

### Task 1: Tokens de cor semântica

**Files:**
- Modify: `src/app/globals.css` (bloco `@theme inline` ~linhas 298–340; bloco `:root` ~linhas 342–375)

**Interfaces:**
- Produces: classes utilitárias Tailwind `bg-pos/text-pos/bg-pos-soft`, idem `neg`, `warn`, `info`, e `bg-wa/text-wa/bg-wa-soft`. Usadas por badges de status, banner, chip de estado vazio, indicador de conexão do WhatsApp.

- [ ] **Step 1: Adicionar as variáveis CSS ao `:root`**

Em `src/app/globals.css`, dentro do bloco `:root { ... }` (logo após `--ring: ...;`), acrescentar:

```css
  /* status semânticos — par "fundo pastel + tinta saturada" */
  --pos: oklch(0.52 0.13 152);
  --pos-soft: oklch(0.95 0.04 152);
  --neg: oklch(0.55 0.19 27);
  --neg-soft: oklch(0.95 0.04 27);
  --warn: oklch(0.55 0.12 70);
  --warn-soft: oklch(0.95 0.05 75);
  --info: oklch(0.52 0.19 262);
  --info-soft: oklch(0.95 0.04 262);
  --wa: oklch(0.76 0.17 152);
  --wa-soft: oklch(0.95 0.05 152);
```

- [ ] **Step 2: Expor ao Tailwind no `@theme inline`**

Dentro do bloco `@theme inline { ... }`, junto dos outros `--color-*`:

```css
  --color-pos: var(--pos);
  --color-pos-soft: var(--pos-soft);
  --color-neg: var(--neg);
  --color-neg-soft: var(--neg-soft);
  --color-warn: var(--warn);
  --color-warn-soft: var(--warn-soft);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
  --color-wa: var(--wa);
  --color-wa-soft: var(--wa-soft);
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: build passa. Nenhum uso ainda; só registra os tokens.

- [ ] **Step 4: Smoke visual rápido**

Criar temporariamente um `<div className="bg-warn-soft text-warn">teste</div>` numa tela qualquer, rodar `npm run dev`, confirmar âmbar pastel, remover o `<div>`.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): tokens de cor semântica (pos/neg/warn/info/wa)"
```

---

### Task 2: `PageHeader` com eyebrow, `SectionLabel`, tabela de ícones

**Files:**
- Modify: `src/components/layout/page-header.tsx`
- Create: `src/components/layout/section-label.tsx`
- Test: `src/components/layout/page-header.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `PageHeader({ title: string; description?: string; eyebrow?: string; action?: ReactNode })` — quando `eyebrow` é passado, renderiza `<p>` com `<span>` tracinho (`h-0.5 w-5 rounded-full bg-primary`) + texto em `font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground`.
  - `SectionLabel({ children: ReactNode; className?: string })` — `<div>` com tracinho curto (`h-0.5 w-3.5 rounded-full bg-primary`) + `text-sm font-semibold`.

**Tabela de equivalência de ícones (mockup sprite → lucide-react)** — usar nas tarefas de tela:

| sprite | lucide | sprite | lucide |
|---|---|---|---|
| `i-search` | `Search` | `i-plus` | `Plus` |
| `i-dots` | `MoreHorizontal` | `i-chev` | `ChevronRight` |
| `i-back` | `ArrowLeft` | `i-pencil` | `Pencil` |
| `i-trash` | `Trash2` | `i-ext` | `ExternalLink` |
| `i-chat` | `MessageCircle` | `i-doc` | `FileText` |
| `i-link` | `Link` (ou `Link2`) | `i-cog` | `Settings` |
| `i-printer` | `Printer` | `i-check` | `Check` |
| `i-checks` | `CheckCheck` | `i-img` | `ImageIcon` |
| `i-paperclip` | `Paperclip` | `i-send` | `Send` |
| `i-alert` | `TriangleAlert` | `i-logout` | `LogOut` |
| `i-activity` | `Activity` | `i-filter` | `Filter` |

- [ ] **Step 1: Escrever o teste que falha**

`src/components/layout/page-header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renderiza título e descrição", () => {
    render(<PageHeader title="Pacientes" description="Cadastro e histórico" />);
    expect(screen.getByRole("heading", { name: "Pacientes" })).toBeInTheDocument();
    expect(screen.getByText("Cadastro e histórico")).toBeInTheDocument();
  });

  it("renderiza o eyebrow quando fornecido", () => {
    render(<PageHeader title="Inbox" eyebrow="Atendimento" />);
    expect(screen.getByText("Atendimento")).toBeInTheDocument();
  });

  it("não renderiza eyebrow quando ausente", () => {
    const { container } = render(<PageHeader title="Inbox" />);
    expect(container.querySelector("[data-slot=eyebrow]")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm run test -- page-header`
Expected: FAIL (`eyebrow` não existe / `data-slot=eyebrow` sempre presente ou ausente errado).

- [ ] **Step 3: Implementar `PageHeader`**

Substituir `src/components/layout/page-header.tsx` por:

```tsx
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
```

- [ ] **Step 4: Implementar `SectionLabel`**

`src/components/layout/section-label.tsx`:

```tsx
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
```

- [ ] **Step 5: Rodar testes**

Run: `npm run test -- page-header`
Expected: PASS (3/3).

- [ ] **Step 6: Verificar tipos e lint**

Run: `npm run lint && npm run build`
Expected: sem erro. `PageHeader` continua compatível com todas as chamadas atuais (eyebrow é opcional).

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/page-header.tsx src/components/layout/section-label.tsx src/components/layout/page-header.test.tsx
git commit -m "feat(ui): eyebrow no PageHeader + SectionLabel"
```

---

### Task 3: `Breadcrumbs`

**Files:**
- Create: `src/components/layout/breadcrumbs.tsx`
- Test: `src/components/layout/breadcrumbs.test.tsx`

**Interfaces:**
- Consumes: `next/link`.
- Produces: `Breadcrumbs({ items: { label: string; href?: string }[] })` — renderiza `<nav aria-label="Trilha">`; cada item exceto o último com `href` vira `<Link>`; separador `ChevronRight size-3` entre itens; o último item é `<span className="font-semibold text-foreground">` sem link. Item sem `href` também renderiza como `<span>`.

- [ ] **Step 1: Escrever o teste que falha**

`src/components/layout/breadcrumbs.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  const items = [
    { label: "Pacientes", href: "/pacientes" },
    { label: "Aparecida de Souza", href: "/pacientes/1" },
    { label: "Tratamento" },
  ];

  it("liga todos os itens menos o último", () => {
    render(<Breadcrumbs items={items} />);
    expect(screen.getByRole("link", { name: "Pacientes" })).toHaveAttribute("href", "/pacientes");
    expect(screen.getByRole("link", { name: "Aparecida de Souza" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tratamento" })).toBeNull();
  });

  it("marca o último item como atual", () => {
    render(<Breadcrumbs items={items} />);
    expect(screen.getByText("Tratamento")).toHaveClass("font-semibold");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- breadcrumbs`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/components/layout/breadcrumbs.tsx`:

```tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav
      aria-label="Trilha"
      className="flex items-center gap-1.5 px-6 pt-4 text-xs text-muted-foreground"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3 opacity-60" />}
            {isLast || !item.href ? (
              <span className={isLast ? "font-semibold text-foreground" : undefined}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Rodar testes**

Run: `npm run test -- breadcrumbs`
Expected: PASS (2/2).

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/breadcrumbs.tsx src/components/layout/breadcrumbs.test.tsx
git commit -m "feat(ui): componente Breadcrumbs"
```

---

### Task 4: `Menu` (wrapper de `@base-ui/react/menu`)

**Files:**
- Create: `src/components/ui/menu.tsx`

**Interfaces:**
- Consumes: `@base-ui/react/menu`, `cn()`. Seguir o mesmo estilo de wrapper fino usado em `src/components/ui/dialog.tsx`.
- Produces (re-exports com `data-slot` + classes):
  - `Menu` = `Menu.Root`
  - `MenuTrigger` = `Menu.Trigger` (uso com `render={<Button .../>}` como o Dialog faz)
  - `MenuContent` — `Menu.Portal > Menu.Positioner > Menu.Popup` com `min-w-[11rem] rounded-xl bg-popover p-1.5 text-sm ring-1 ring-foreground/10 shadow-lg outline-none`, `sideOffset={4}`, `align="end"`.
  - `MenuItem` — `Menu.Item` com `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left data-highlighted:bg-muted outline-none`, ícone `size-3.5 text-muted-foreground`. Prop extra `variant?: "default" | "danger"` → `danger` aplica `text-destructive [&_svg]:text-destructive`.
  - `MenuSeparator` — `Menu.Separator` com `my-1 mx-1 h-px bg-border`.

- [ ] **Step 1: Conferir a API do Base UI Menu instalada**

Run: `ls node_modules/@base-ui/react/menu` e abrir `node_modules/@base-ui/react/menu/index.d.ts` (ou `grep -r "Positioner" node_modules/@base-ui/react/menu`).
Expected: confirmar os subcomponentes disponíveis (`Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Item`, `Separator`, `Group`, `GroupLabel`). Ajustar os nomes na implementação se o pacote diferir do descrito aqui.

- [ ] **Step 2: Implementar o wrapper**

`src/components/ui/menu.tsx`:

```tsx
"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />;
}

function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />;
}

function MenuContent({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={4} align="end" className="z-50">
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "min-w-[11rem] rounded-xl bg-popover p-1.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({
  className,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & { variant?: "default" | "danger" }) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "flex w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none select-none",
        "data-highlighted:bg-muted [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        variant === "danger" && "text-destructive [&_svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function MenuSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator };
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run build`
Expected: sem erro. Se algum tipo (`MenuPrimitive.Popup.Props` etc.) não existir com esse nome no pacote, corrigir para o nome real visto no Step 1.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/menu.tsx
git commit -m "feat(ui): wrapper Menu sobre @base-ui/react/menu"
```

---

### Task 5: `RowActionsMenu` (⋯ com confirmação destrutiva inline)

**Files:**
- Create: `src/components/ui/row-actions.tsx`
- Test: `src/components/ui/row-actions.test.tsx`

**Interfaces:**
- Consumes: `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem`, `MenuSeparator` (Task 4); `Button`; `MoreHorizontal` de lucide.
- Produces:

```ts
type RowAction =
  | { label: string; icon?: React.ComponentType<{ className?: string }>; onSelect: () => void }
  | { separator: true };

type DestructiveAction = {
  label: string;          // ex.: "Excluir"
  icon?: React.ComponentType<{ className?: string }>;
  confirmText: string;    // frase mostrada no passo de confirmação
  confirmLabel: string;   // ex.: "Excluir"
  onConfirm: () => void;
};

function RowActionsMenu(props: {
  actions: RowAction[];
  destructive?: DestructiveAction;
  triggerLabel?: string; // aria-label do botão ⋯, default "Ações"
}): JSX.Element;
```

Comportamento: botão ⋯ (`Button variant="ghost" size="icon-sm"`) abre `MenuContent`. Itens normais fecham o menu ao selecionar e chamam `onSelect`. Se `destructive` existe: um `MenuSeparator` + um `MenuItem variant="danger"` cujo `onSelect` **não fecha o menu** — troca o conteúdo do popover para um bloco de confirmação (`confirmText` + botão "Cancelar" [volta pra lista] + botão destrutivo [chama `onConfirm` e fecha]). Ao fechar/reabrir o menu, sempre volta ao passo "lista". Espelha o padrão `.menu-confirm` do mockup (ver `<div class="menu-confirm">` na seção WHATSAPP e PACIENTES do mockup).

- [ ] **Step 1: Escrever os testes que falham**

`src/components/ui/row-actions.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RowActionsMenu } from "./row-actions";

function setup(overrides = {}) {
  const onEdit = vi.fn();
  const onConfirm = vi.fn();
  render(
    <RowActionsMenu
      actions={[{ label: "Editar dados", onSelect: onEdit }]}
      destructive={{
        label: "Excluir",
        confirmText: "Excluir Aparecida e todo o histórico?",
        confirmLabel: "Excluir",
        onConfirm,
      }}
      {...overrides}
    />,
  );
  return { onEdit, onConfirm };
}

describe("RowActionsMenu", () => {
  it("dispara a ação normal e fecha o menu", async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    await user.click(screen.getByRole("button", { name: "Ações" }));
    await user.click(screen.getByText("Editar dados"));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("pede confirmação antes de destruir", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Ações" }));
    await user.click(screen.getByText("Excluir"));
    // ainda não destruiu — mostra a frase de confirmação
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Excluir Aparecida e todo o histórico?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("Cancelar volta para a lista sem destruir", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Ações" }));
    await user.click(screen.getByText("Excluir"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Editar dados")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- row-actions`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/components/ui/row-actions.tsx`:

```tsx
"use client";

import { useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

type IconType = ComponentType<{ className?: string }>;

export type RowAction =
  | { label: string; icon?: IconType; onSelect: () => void }
  | { separator: true };

export type DestructiveAction = {
  label: string;
  icon?: IconType;
  confirmText: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function RowActionsMenu({
  actions,
  destructive,
  triggerLabel = "Ações",
}: {
  actions: RowAction[];
  destructive?: DestructiveAction;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  return (
    <Menu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(false);
      }}
    >
      <MenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={triggerLabel}>
            <MoreHorizontal />
          </Button>
        }
      />
      <MenuContent>
        {confirming && destructive ? (
          <div className="p-2">
            <p className="mb-2.5 text-xs text-muted-foreground">{destructive.confirmText}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  destructive.onConfirm();
                  close();
                }}
              >
                {destructive.confirmLabel}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {actions.map((action, i) =>
              "separator" in action ? (
                <MenuSeparator key={i} />
              ) : (
                <MenuItem
                  key={i}
                  onClick={() => {
                    action.onSelect();
                    close();
                  }}
                >
                  {action.icon ? <action.icon /> : null}
                  {action.label}
                </MenuItem>
              ),
            )}
            {destructive && (
              <>
                <MenuSeparator />
                <MenuItem
                  variant="danger"
                  closeOnClick={false}
                  onClick={() => setConfirming(true)}
                >
                  {destructive.icon ? <destructive.icon /> : null}
                  {destructive.label}
                </MenuItem>
              </>
            )}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
```

> Nota: se `@base-ui/react/menu` `Item` não aceitar `closeOnClick`, checar a prop equivalente (`onClick` com `event.preventDefault()`, ou envolver o passo de confirmação como um `Menu.SubmenuRoot`). Ajustar conforme a API vista na Task 4 Step 1. O contrato dos testes não muda.

- [ ] **Step 4: Rodar testes**

Run: `npm run test -- row-actions`
Expected: PASS (3/3). Se o menu do Base UI portalizar fora do container do RTL, usar `screen` (já usado) — deve funcionar; se não, adicionar `within(document.body)`.

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/row-actions.tsx src/components/ui/row-actions.test.tsx
git commit -m "feat(ui): RowActionsMenu com confirmação destrutiva inline"
```

---

### Task 6: Primitivos de tabela

**Files:**
- Create: `src/components/ui/table.tsx`

**Interfaces:**
- Consumes: `cn()`.
- Produces (todos `ComponentProps` do elemento nativo correspondente + `className`):
  - `Table` → `<div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10"><table className="w-full border-collapse text-sm">`
  - `THead` → `<thead>` — filhos `TH` recebem `bg-muted px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap`
  - `TH` → `<th className={cn("bg-muted px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap", className)}>`
  - `TBody` → `<tbody>`
  - `TR` → `<tr>` com prop `selected?: boolean` → `data-selected` + classe `data-[selected=true]:bg-primary/8`; sempre `border-t border-border first:border-t-0 hover:bg-muted/40`
  - `TD` → `<td className={cn("px-3.5 py-2.5 align-middle", className)}>` (py-2.5 + conteúdo dá ~44px)
  - `RowActionsCell` → `<td className="w-13 px-2 text-right">` com wrapper `<div className="flex justify-end opacity-0 transition-opacity group-hover/row:opacity-100 data-[force=true]:opacity-100">` — usar em conjunto com `group/row` na `TR`. Aceita `forceVisible?: boolean` (menu aberto).

- [ ] **Step 1: Implementar**

`src/components/ui/table.tsx`:

```tsx
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
```

- [ ] **Step 2: Build + lint**

Run: `npm run lint && npm run build`
Expected: sem erro (nenhum consumidor ainda).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/table.tsx
git commit -m "feat(ui): primitivos de tabela (header cinza, linha 44px, row-actions no hover)"
```

---

### Task 7: `SelectionBar`, `EmptyState`, `Meter`, `DescriptionList`

**Files:**
- Create: `src/components/ui/selection-bar.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/ui/meter.tsx`
- Create: `src/components/ui/description-list.tsx`
- Test: `src/components/ui/selection-bar.test.tsx`

**Interfaces:**
- `SelectionBar({ count, actionLabel, onAction, onClear })` — nada renderizado quando `count === 0`; senão barra `flex items-center gap-3 rounded-lg bg-foreground px-4 py-2 text-sm text-background`: `<b>{count} selecionado{count === 1 ? "" : "s"}</b>`, spacer, botão ação (`bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-semibold`), botão "Limpar seleção" (`bg-background/15 ...`).
- `EmptyState({ icon: IconType, title, description?, action? })` — coluna centralizada, chip `size-10 rounded-xl bg-primary/10 text-primary` com o ícone `size-5`, `title` `text-sm font-medium`, `description` `text-xs text-muted-foreground`, `action` opcional abaixo.
- `Meter({ value, max, tone? })` — `value/max` → largura %. `tone` default `"primary"`; `"danger"` quando perto do limite → barra `bg-destructive`. Trilho `h-2 rounded-full bg-muted`, preenchimento `bg-primary`.
- `DescriptionList({ children })` → `<dl className="flex flex-col gap-2.5">`; `DLRow({ label, children })` → `<div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="text-sm">{children}</dd></div>`.

- [ ] **Step 1: Teste que falha para `SelectionBar`**

`src/components/ui/selection-bar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./selection-bar";

describe("SelectionBar", () => {
  it("não renderiza nada com zero selecionados", () => {
    const { container } = render(
      <SelectionBar count={0} actionLabel="Enviar mensagem" onAction={vi.fn()} onClear={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a contagem e dispara as ações", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClear = vi.fn();
    render(
      <SelectionBar count={2} actionLabel="Enviar mensagem" onAction={onAction} onClear={onClear} />,
    );
    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await user.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("usa singular com um selecionado", () => {
    render(
      <SelectionBar count={1} actionLabel="Enviar mensagem" onAction={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- selection-bar`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar os quatro arquivos**

`src/components/ui/selection-bar.tsx`:

```tsx
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
```

`src/components/ui/empty-state.tsx`:

```tsx
import type { ComponentType, ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-11 text-center text-muted-foreground">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs">{description}</p>}
      {action}
    </div>
  );
}
```

`src/components/ui/meter.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function Meter({
  value,
  max,
  tone = "primary",
}: {
  value: number;
  max: number;
  tone?: "primary" | "danger";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", tone === "danger" ? "bg-destructive" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
```

`src/components/ui/description-list.tsx`:

```tsx
import type { ReactNode } from "react";

export function DescriptionList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-2.5">{children}</dl>;
}

export function DLRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Rodar testes**

Run: `npm run test -- selection-bar`
Expected: PASS (3/3).

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/selection-bar.tsx src/components/ui/empty-state.tsx src/components/ui/meter.tsx src/components/ui/description-list.tsx src/components/ui/selection-bar.test.tsx
git commit -m "feat(ui): SelectionBar, EmptyState, Meter, DescriptionList"
```

---

## FASE B — Aplicação nas telas

> Regra para todas as tarefas da Fase B: abrir `docs/superpowers/specs/2026-09-03-redesenho-telas-mockup.html` na seção indicada, portar a **estrutura e as classes** para o componente React existente, mantendo **todo** o comportamento listado em "Preservar". Ao terminar, rodar `npm run test && npm run lint && npm run build` e conferir a tela no `npm run dev` contra o mockup. Um commit no fim.

---

### Task 8: Procedimentos

**Files:**
- Modify: `src/app/(app)/procedimentos/page.tsx`
- Modify: `src/components/procedures/procedures-client.tsx`
- Mockup: seção `<!-- ============ PROCEDIMENTOS ============ -->`

**Preservar (não mexer):** `useState` de `procedures/name/price/duration/error`; `upsertLocal`; `handleCreate`; `handleDelete`; `createProcedureAction` / `updateProcedureAction` / `deleteProcedureAction`; o padrão "salva no `onBlur` quando o valor mudou".

**Interfaces:**
- Consumes: `PageHeader` (eyebrow), `Table/THead/TH/TBody/TR/TD/RowActionsCell`, `RowActionsMenu`, `Button`, `Input`, `EmptyState` da Fase A.

- [ ] **Step 1: Cabeçalho da página**

Em `procedimentos/page.tsx`, passar `eyebrow="Clínica"` e a ação primária ancorada no header:

```tsx
<PageHeader
  title="Procedimentos"
  eyebrow="Clínica"
  description="Valor e duração padrão de cada procedimento. Usados como sugestão ao agendar e ao lançar no financeiro."
  action={
    <Button type="button" onClick={/* abrir linha de novo procedimento — ver Step 3 */}>
      <Plus />
      Adicionar procedimento
    </Button>
  }
/>
```

Como `page.tsx` é RSC e o botão precisa de handler, mover o botão para dentro do `ProceduresClient` **ou** expor um estado via `ProceduresClient` com um cabeçalho próprio. Abordagem escolhida (mais simples, segue o que outras telas farão): manter `PageHeader` sem `action` no `page.tsx` e o `ProceduresClient` renderiza sua própria toolbar com o botão "Adicionar procedimento". Deixar o `action` do header vazio aqui.

- [ ] **Step 2: Reescrever o corpo do `ProceduresClient` com a tabela**

Estrutura alvo (o mockup mostra: tabela com colunas Procedimento / Valor padrão / Duração / ⋯; linha em edição com fundo `bg-primary/8` e inputs; rodapé "＋ Adicionar procedimento" como linha da própria tabela/card):

```tsx
return (
  <div className="space-y-4 px-6 pb-6">
    {error && <p className="text-sm text-destructive">{error}</p>}

    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <THead>
          <TR>
            <TH>Procedimento</TH>
            <TH className="w-[150px]">Valor padrão</TH>
            <TH className="w-[130px]">Duração</TH>
            <TH className="w-13" />
          </TR>
        </THead>
        <TBody>
          {procedures.length === 0 && (
            <TR>
              <TD colSpan={4} className="p-0">
                <EmptyState icon={ClipboardList} title="Nenhum procedimento cadastrado" />
              </TD>
            </TR>
          )}
          {procedures.map((p) =>
            editingId === p.id ? (
              <TR key={p.id} selected>
                <TD><Input defaultValue={p.name} onBlur={/* mesmo onBlur atual */} /></TD>
                <TD><Input inputMode="decimal" className="w-24" defaultValue={p.defaultPrice} onBlur={/* atual */} /></TD>
                <TD><Input inputMode="numeric" className="w-20" defaultValue={p.defaultDurationMinutes} onBlur={/* atual */} /></TD>
                <TD className="text-right">
                  <Button size="sm" onClick={() => setEditingId(null)}>Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                </TD>
              </TR>
            ) : (
              <TR key={p.id}>
                <TD>{p.name}</TD>
                <TD className="tabular-nums">{formatBRL(p.defaultPrice)}</TD>
                <TD className="tabular-nums">{p.defaultDurationMinutes} min</TD>
                <RowActionsCell forceVisible={menuOpenId === p.id}>
                  <RowActionsMenu
                    actions={[{ label: "Editar", icon: Pencil, onSelect: () => setEditingId(p.id) }]}
                    destructive={{
                      label: "Excluir",
                      icon: Trash2,
                      confirmText: `Excluir "${p.name}"?`,
                      confirmLabel: "Excluir",
                      onConfirm: () => handleDelete(p.id),
                    }}
                  />
                </RowActionsCell>
              </TR>
            ),
          )}
        </TBody>
      </Table>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex w-full items-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="size-4" /> Adicionar procedimento
      </button>
    </div>
  </div>
);
```

Notas de implementação:
- Adicionar `useState` **novos e locais** só de UI: `editingId: string | null`, `creating: boolean`, `menuOpenId: string | null` (opcional; se `RowActionsMenu` não expõe `onOpenChange`, omitir `forceVisible` e deixar o CSS `group-hover` cuidar).
- O modo `creating` renderiza uma `TR selected` com os `Input` controlados por `name/price/duration` já existentes + botões Salvar (chama `handleCreate` atual, depois `setCreating(false)`) / Cancelar.
- `formatBRL` — se já existe helper no projeto (`grep -rn "toLocaleString.*BRL\|Intl.NumberFormat" src`), reusar; senão inline `new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)`.
- Remover imports que ficarem órfãos (`Card`, `CardContent` se não usados).

- [ ] **Step 3: Testes existentes + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: verde. Não há teste de componente para procedures hoje; não criar um novo (é restyle).

- [ ] **Step 4: Conferência visual**

`npm run dev` → `/procedimentos`. Conferir contra o mockup: header cinza uppercase, linhas ~44px, hover revela ⋯, "Editar" no menu abre linha com fundo laranja-claro + inputs, "Excluir" pede confirmação dentro do popover, rodapé "＋ Adicionar procedimento".

- [ ] **Step 5: Commit**

```bash
git add src/components/procedures/procedures-client.tsx src/app/(app)/procedimentos/page.tsx
git commit -m "refactor(ui): tela de Procedimentos no padrão do redesenho"
```

---

### Task 9: Configurações

**Files:**
- Modify: `src/app/(app)/configuracoes/page.tsx`
- Modify: `src/components/settings/settings-client.tsx`
- Mockup: seção `<!-- ============ CONFIGURAÇÕES ============ -->`

**Preservar:** `useState` de `professionalName/councilId/saving/message/error`; `usedMb/usedPct/nearLimit`; `handleSave`; `updateProfessionalIdentityAction`; constante `GB`.

**Interfaces:**
- Consumes: `PageHeader` (eyebrow), `Card/CardHeader/CardTitle/CardContent`, `Meter` (Task 7), `Button`, `Input`, `Label`, `Check` de lucide.

- [ ] **Step 1: Cabeçalho**

`configuracoes/page.tsx`: `eyebrow="Clínica"`, manter title/description.

- [ ] **Step 2: Reescrever `SettingsClient`**

Layout alvo (mockup): coluna `max-w-xl` com 3 cards — "Identidade profissional" (nome + registro no conselho + botão Salvar com linha "✓ Configurações salvas." ao lado), "Armazenamento de fotos" (número grande `312 MB` + `de 1 GB`, `Meter`, texto de política), "Conta" (linhas rótulo/valor E-mail / Plano + botão "Sair da conta").

```tsx
return (
  <div className="mx-6 mb-6 flex max-w-xl flex-col gap-5">
    <Card>
      <CardHeader className="border-b"><CardTitle>Identidade profissional</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <p className="text-xs text-muted-foreground">
          Aparece no cabeçalho e no rodapé do relatório clínico e dos termos de consentimento.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-1.5">
          <Label htmlFor="professionalName">Nome da profissional</Label>
          <Input id="professionalName" value={professionalName} onChange={/* atual */} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="councilId">Registro no conselho</Label>
          <Input id="councilId" value={councilId} onChange={/* atual */} placeholder="COREN-SP 123456" />
          <p className="text-xs text-muted-foreground">Ex.: COREN-SP 123456. Deixe em branco se ainda não tiver.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {message && (
            <span className="flex items-center gap-1.5 text-xs text-pos">
              <Check className="size-3.5" /> {message}
            </span>
          )}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="border-b"><CardTitle>Armazenamento de fotos</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{usedMb.toFixed(usedMb < 10 ? 1 : 0)} MB</span>
          <span className="text-sm text-muted-foreground">de 1 GB</span>
        </div>
        <Meter value={initial.storageBytes} max={GB} tone={nearLimit ? "danger" : "primary"} />
        <p className="text-xs text-muted-foreground">
          Fotos de evolução dos tratamentos. Ao chegar a 1 GB, o envio de novas fotos é bloqueado até você liberar espaço.
        </p>
      </CardContent>
    </Card>

    {/* Card "Conta" — só se os dados de e-mail/plano estiverem disponíveis via props.
        Se NÃO estiverem (hoje SettingsClient não recebe e-mail/plano), OMITIR este card
        nesta tarefa e anotar como follow-up. Não adicionar query nova. */}
  </div>
);
```

- [ ] **Step 3: Decisão sobre o card "Conta"**

`grep -n "getClinicSettingsAction" src/app/(app)/configuracoes/actions.ts` e ver o shape retornado. Se não inclui e-mail/plano, **não** implementar o card "Conta" agora (violaria a constraint de não mexer em dados) — deixar comentário `{/* TODO card Conta: precisa de e-mail/plano nas props */}` e seguir. Se inclui, implementar com `DescriptionList`/`DLRow`.

- [ ] **Step 4: Testes + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: verde.

- [ ] **Step 5: Conferência visual**

`/configuracoes`: coluna estreita, 3 (ou 2) cards seccionados, número grande + meter, "✓ Configurações salvas." em verde ao lado do Salvar após salvar.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/settings-client.tsx src/app/(app)/configuracoes/page.tsx
git commit -m "refactor(ui): tela de Configurações no padrão do redesenho"
```

---

### Task 10: WhatsApp Inbox

**Files:**
- Modify: `src/app/(app)/whatsapp/page.tsx`
- Modify: `src/components/whatsapp/whatsapp-client.tsx`
- Mockup: seção `<!-- ============ WHATSAPP ============ -->`

**Preservar (crítico — muita lógica):** todos os `useState`; `refreshConnection`; os 4 `useEffect` de polling (conexão, mensagens da conversa, polling de mensagens 5s, polling de conversas 5s); `handleToggleConnection`; `fetchMessages`; `handleSend`; `handleConversationCreated`; `NewConversationDialog`; `UazapiConfigDialog`; todas as server actions; `formatRelativeTime`; `initials`.

**Interfaces:**
- Consumes: `PageHeader` (eyebrow "Atendimento", title "Inbox"), `Menu`/`MenuItem` (menu de conexão), `Button`, `Input`, `Avatar`, `EmptyState`, ícones lucide (`MessageCircle`, `MoreHorizontal`, `Paperclip`, `Send`, `CheckCheck`, `ExternalLink`, `Search`, `Plus`).

- [ ] **Step 1: Cabeçalho**

`whatsapp/page.tsx`:

```tsx
<PageHeader
  title="Inbox"
  eyebrow="Atendimento"
  description="Conversas com pacientes pelo WhatsApp."
/>
```

(O botão "Nova conversa" continua dentro do `WhatsappClient` como hoje — ver Step 2 para posição.)

- [ ] **Step 2: Faixa de conexão (`wa-strip`)**

Substituir o bloco atual (`<div className="flex items-center justify-between gap-2">` com Badge + Conectar + UazapiConfigDialog + NewConversationDialog) por:

```tsx
<div className="flex flex-wrap items-center gap-2.5">
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold",
      connection?.status === "connected" ? "bg-wa-soft text-wa" : "bg-neg-soft text-neg",
    )}
  >
    <span className={cn("size-1.5 rounded-full", connection?.status === "connected" ? "bg-wa" : "bg-neg")} />
    {connection?.status === "connected" ? "Conectado" : "Desconectado"}
  </span>
  {connection?.phoneNumber && (
    <span className="text-xs text-muted-foreground tabular-nums">{connection.phoneNumber}</span>
  )}
  <div className="ml-auto flex items-center gap-2">
    {/* menu ⋯ de conexão: Configurar WhatsApp (abre UazapiConfigDialog), Conectar/Desconectar (handleToggleConnection) */}
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Opções de conexão"><MoreHorizontal /></Button>} />
      <MenuContent>
        <MenuItem onClick={/* abrir config */}><Settings />Configurar WhatsApp</MenuItem>
        <MenuItem onClick={handleToggleConnection}>
          <LogOut />{connection?.status === "connected" ? "Desconectar" : "Conectar"}
        </MenuItem>
      </MenuContent>
    </Menu>
    <NewConversationDialog onCreated={handleConversationCreated} />
  </div>
</div>
```

Notas:
- `connection?.phoneNumber` — usar o campo real do `WhatsappConnectionSummary` (checar o tipo; se o número não existe no summary, omitir a linha do telefone).
- `UazapiConfigDialog` hoje é acionado pelo seu próprio `DialogTrigger`. Para colocá-lo dentro do `MenuItem`, ou (a) manter o `UazapiConfigDialog` renderizado fora do menu com `open` controlado por um `useState` novo (`configOpen`) e o `MenuItem` só faz `setConfigOpen(true)`, ou (b) manter o botão "Configurar WhatsApp" visível na strip como hoje. Preferir (a). Não mudar o conteúdo do dialog.
- Manter `connectionError` e o bloco `qrCode` logo abaixo da strip como estão (funcionam).

- [ ] **Step 3: Painel de conversas + chat**

O grid `md:grid-cols-[320px_1fr]` com `ring-1 ring-foreground/10` já está próximo do mockup. Ajustes:
- Lista: adicionar campo de busca no topo (`<div className="border-b p-3"><div className="relative">…<Search/>…<Input className="pl-8"/></div></div>`) — **apenas visual**, sem filtrar (ou filtrar client-side o array `conversations` por `contactName` com um `useState` local `convQuery`; escolha do implementador, marcar TODO se deixar sem função).
- Item de conversa: manter o `<button>` e handlers; ajustar classes para o mockup — avatar, `line1` com nome + `time` (`formatRelativeTime`), `line2` com preview + badge de não lidas (`bg-wa text-white`), barra lateral laranja `before:` quando ativa (`data-[active=true]:before:…` ou classe condicional). Ver `.wa-conv` no mockup.
- Cabeçalho do chat: avatar + nome + subtítulo (idade/condição se disponível no tipo `Conversation`; senão só o nome) + spacer + `<Button variant="outline" size="sm">` "Abrir prontuário" (link para `/pacientes/[contactId]` se `conversation.contactId` existir) + ⋯.
- Bolhas: manter o `.map`; trocar classes para `bg-white` (entrada) / `bg-[#d9fdd3]` (saída) — o mockup usa `#e6fbd6`, manter o verde atual do projeto — com `rounded-lg px-3 py-2 text-sm shadow-sm` e um rodapé de horário (`formatRelativeTime` ou hora curta) + `<CheckCheck className="size-3.5 text-info" />` nas mensagens `outbound`.
- Área de composição: `<Paperclip>` (icon-btn, sem função — TODO anexo), `Input` (rounded-full, `bg-muted`), `<Button>` "Enviar" com `<Send/>`. Manter `handleSend` e o `onKeyDown` Enter.
- Estado vazio ("Nenhuma conversa ainda", "Selecione uma conversa…") → trocar os `<p>` por `<EmptyState icon={MessageCircle} title="…" />`.

- [ ] **Step 4: Estado desconectado (bloco separado do mockup)**

O mockup mostra um card de "Estado quando o WhatsApp está desconectado" com QR + passos numerados. O componente **já** renderiza `qrCode` quando `status === "connecting"`. Melhorar esse bloco existente para o visual do mockup: card centralizado, badge "Desconectado", `<img>` do QR num quadro branco `rounded-xl border p-2.5`, lista `<ol>` com 3 passos numerados (chips laranja), texto "O código expira em 40 segundos…". Não criar tela nova — é o mesmo `{qrCode && (...)}`.

- [ ] **Step 5: Testes + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: verde. `whatsapp-client` não tem teste de componente; não adicionar.

- [ ] **Step 6: Conferência visual + funcional**

`/whatsapp`: header "Inbox" / eyebrow "Atendimento"; strip de conexão com pílula verde/vermelha + ⋯; menu ⋯ conecta/desconecta e abre config; lista com busca, avatares, não-lidas; chat com bolhas + duplo-check; composição rounded-full. **Confirmar que o polling ainda roda** (abrir devtools Network, ver as chamadas a cada 5s) e que enviar mensagem ainda funciona.

- [ ] **Step 7: Commit**

```bash
git add src/components/whatsapp/whatsapp-client.tsx src/app/(app)/whatsapp/page.tsx
git commit -m "refactor(ui): WhatsApp Inbox no padrão do redesenho"
```

---

### Task 11: Pacientes (lista)

**Files:**
- Modify: `src/app/(app)/pacientes/page.tsx`
- Modify: `src/components/patients/patients-client.tsx`
- Mockup: seção `<!-- ============ PACIENTES (list) ============ -->` (o `<div data-pscreen="list">`)

**Preservar:** `useState` de `patients/query/selectedIds/formOpen/editingPatient/bulkMessageOpen/error/confirmingDeleteId`; `handleSearch`; `toggleSelected`; `toggleSelectAll`; `openNewPatientForm`; `handleSaved`; `handleDelete`; `calculateAge`; `PatientFormDialog`; `BulkMessageDialog`; todas as actions.

**Interfaces:**
- Consumes: `PageHeader` (eyebrow "Clínica", action "Novo paciente"), `Table/*`, `RowActionsMenu`, `SelectionBar`, `EmptyState`, `Badge`, `Avatar`, `Input`, `Search`/`Plus`/`Users`/`Pencil`/`MessageCircle`/`Trash2`/`ExternalLink` de lucide.

- [ ] **Step 1: Cabeçalho com ação ancorada**

`pacientes/page.tsx` é RSC; o botão "Novo paciente" precisa de handler no client. Padrão: `PageHeader` sem `action` no `page.tsx` (com `eyebrow="Clínica"`), e o `PatientsClient` renderiza a toolbar com busca + contagem + botão "Novo paciente" à direita. (Consistente com Procedimentos/Task 8.)

Alternativa se quiser o botão no `PageHeader` de fato: extrair um `<PatientsPageHeaderAction>` client pequeno. Não obrigatório — decidir e seguir um padrão único em toda a Fase B.

- [ ] **Step 2: Toolbar**

```tsx
<div className="flex flex-wrap items-center gap-3">
  <div className="relative max-w-sm flex-1">
    <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
    <Input
      placeholder="Buscar por nome ou telefone"
      value={query}
      onChange={(e) => handleSearch(e.target.value)}
      className="pl-8"
    />
  </div>
  <span className="text-xs text-muted-foreground">
    {patients.length} {patients.length === 1 ? "paciente" : "pacientes"}
  </span>
  <Button type="button" className="ml-auto" onClick={openNewPatientForm}>
    <Plus /> Novo paciente
  </Button>
</div>
```

- [ ] **Step 3: Barra de seleção**

Trocar o antigo botão "Enviar mensagem (N)" por:

```tsx
<SelectionBar
  count={selectedIds.size}
  actionLabel="Enviar mensagem"
  onAction={() => setBulkMessageOpen(true)}
  onClear={() => setSelectedIds(new Set())}
/>
```

- [ ] **Step 4: Tabela**

Colunas do mockup: `[checkbox] · Paciente (avatar + nome linkado + telefone) · E-mail · Idade · Último tratamento (badge status + data) · ⋯`.

```tsx
<Table>
  <THead>
    <TR>
      <TH className="w-10">
        <input type="checkbox" className="accent-primary size-4"
          checked={patients.length > 0 && selectedIds.size === patients.length}
          onChange={toggleSelectAll} aria-label="Selecionar todos" />
      </TH>
      <TH>Paciente</TH>
      <TH>E-mail</TH>
      <TH className="w-[70px]">Idade</TH>
      <TH className="w-[190px]">Último tratamento</TH>
      <TH className="w-13" />
    </TR>
  </THead>
  <TBody>
    {patients.length === 0 && (
      <TR><TD colSpan={6} className="p-0">
        <EmptyState icon={Users} title="Nenhum paciente encontrado"
          description={query ? "Tente outro termo de busca." : undefined} />
      </TD></TR>
    )}
    {patients.map((patient) => (
      <TR key={patient.id} selected={selectedIds.has(patient.id)}>
        <TD>
          <input type="checkbox" className="accent-primary size-4"
            checked={selectedIds.has(patient.id)}
            onChange={() => toggleSelected(patient.id)}
            aria-label={`Selecionar ${patient.name}`} />
        </TD>
        <TD>
          <div className="flex items-center gap-3">
            <Avatar size="sm"><AvatarFallback>{initials(patient.name)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <Link href={`/pacientes/${patient.id}`} className="block font-medium hover:underline">
                {patient.name}
              </Link>
              <span className="block text-xs text-muted-foreground tabular-nums">{patient.phone}</span>
            </div>
          </div>
        </TD>
        <TD>{patient.email ?? "—"}</TD>
        <TD className="tabular-nums">{calculateAge(patient.birthDate)}</TD>
        <TD>{/* badge de status do último tratamento — ver nota */}—</TD>
        <RowActionsCell>
          <RowActionsMenu
            actions={[
              { label: "Ver paciente", icon: ExternalLink, onSelect: () => router.push(`/pacientes/${patient.id}`) },
              { label: "Editar dados", icon: Pencil, onSelect: () => { setEditingPatient(patient); setFormOpen(true); } },
              { label: "Enviar mensagem", icon: MessageCircle, onSelect: () => { setSelectedIds(new Set([patient.id])); setBulkMessageOpen(true); } },
            ]}
            destructive={{
              label: "Excluir", icon: Trash2,
              confirmText: `Excluir ${patient.name} e todo o histórico? Esta ação não pode ser desfeita.`,
              confirmLabel: "Excluir",
              onConfirm: () => handleDelete(patient.id), // ver nota sobre confirmingDeleteId
            }}
          />
        </RowActionsCell>
      </TR>
    ))}
  </TBody>
</Table>
```

Notas:
- `initials` — não existe em `patients-client`; importar de onde já existe ou inline (mesma função de `whatsapp-client`/`sidebar`). Considerar extrair para `src/lib/utils.ts` um `initials(name: string)` **só se** for trivial e usado em 3+ lugares; senão inline.
- `router` — adicionar `import { useRouter } from "next/navigation"` + `const router = useRouter()`.
- **`confirmingDeleteId`**: hoje `handleDelete` tem um gate de dois cliques (`if (confirmingDeleteId !== id) { setConfirmingDeleteId(id); return; }`). Com `RowActionsMenu` fazendo a confirmação no popover, esse gate fica redundante. Opção mínima: passar `onConfirm={() => { setConfirmingDeleteId(patient.id); handleDelete(patient.id); }}` para satisfazer o gate — **feio**. Opção limpa e permitida (não é lógica de dados, é fluxo de UI): adicionar um `deletePatientNow(id)` que faz só o corpo do `try` atual sem o gate, e `handleDelete` passa a chamá-lo. Preferir a opção limpa; manter `deletePatientAction` intacta.
- Coluna "Último tratamento": o tipo `Contact` provavelmente não traz o status do último tratamento. Se não traz, renderizar `—` e anotar TODO (não adicionar query). Se o mockup-parity exige, é follow-up de dados.

- [ ] **Step 5: Testes + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: verde. Existe `build-contact-input.test.ts` — não relacionado, deve continuar passando.

- [ ] **Step 6: Conferência visual**

`/pacientes`: toolbar com busca+contagem+ação; selecionar linhas mostra a barra escura; linhas selecionadas com tint laranja; ⋯ no hover com Ver/Editar/Enviar/Excluir; excluir confirma no popover.

- [ ] **Step 7: Commit**

```bash
git add src/components/patients/patients-client.tsx src/app/(app)/pacientes/page.tsx
git commit -m "refactor(ui): lista de Pacientes no padrão do redesenho"
```

---

### Task 12: Paciente — detalhe

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/page.tsx`
- Modify: `src/components/patients/patient-detail-client.tsx`
- Mockup: `<!-- ---- PACIENTE: detalhe ---- -->` (`<div data-pscreen="detail">`)

**Preservar:** `useState` de `patient/treatments/editOpen/treatmentFormOpen`; `PatientFormDialog`; `TreatmentFormDialog`; `formatDate`; navegação por `<Link>` para tratamentos e documentos.

**Interfaces:**
- Consumes: `PageHeader` (eyebrow "Paciente"), `Breadcrumbs`, `SectionLabel`, `Card`, `Avatar`, `DescriptionList`/`DLRow`, `Badge`, `Button`, `EmptyState`, `ChevronRight`/`FileText`/`Pencil`/`Plus`/`Check` de lucide.

- [ ] **Step 1: Cabeçalho + breadcrumbs**

`pacientes/[id]/page.tsx`: acima do `PageHeader`, renderizar
`<Breadcrumbs items={[{ label: "Pacientes", href: "/pacientes" }, { label: patient.name }]} />`.
`PageHeader` com `eyebrow="Paciente"`, `title={patient.name}`, `description` = "Cadastrada em … · N tratamento(s) ativo(s)" se der para montar com os dados atuais (senão manter a descrição atual). `action` = dois botões outline "Documentos" (Link para `…/documentos`) e "Editar dados". Como precisa de handler ("Editar dados" abre dialog), seguir o padrão: mover essas ações para dentro do `PatientDetailClient` no topo, **ou** deixar só "Documentos" (é Link, pode ficar no RSC) no `action` e "Editar dados" na coluna direita do client. Escolher o mesmo padrão da Fase B.

- [ ] **Step 2: Grid de 2 colunas**

```tsx
<div className="grid items-start gap-5 px-6 pb-6 md:grid-cols-[284px_1fr]">
  {/* trilho de identidade — sticky */}
  <Card className="md:sticky md:top-5">
    <div className="flex flex-col items-center gap-2 px-5 pt-6 pb-4 text-center">
      <Avatar className="size-14 text-lg"><AvatarFallback>{initials(patient.name)}</AvatarFallback></Avatar>
      <b className="text-base font-medium">{patient.name}</b>
      <span className="text-xs text-muted-foreground">{calculateAge(patient.birthDate)} anos</span>
    </div>
    <div className="border-t px-5 py-4">
      <DescriptionList>
        <DLRow label="Telefone"><span className="tabular-nums">{patient.phone}</span></DLRow>
        <DLRow label="E-mail">{patient.email ?? "—"}</DLRow>
        <DLRow label="CPF"><span className="tabular-nums">{patient.cpf ?? "—"}</span></DLRow>
        <DLRow label="Nascimento">
          <span className="tabular-nums">{patient.birthDate ? formatDate(patient.birthDate) : "—"}</span>
        </DLRow>
      </DescriptionList>
    </div>
    <div className="flex flex-col gap-2 border-t px-5 py-4">
      <div className="flex items-center justify-between">
        <b className="text-xs font-medium">Documentos</b>
        {/* doc-dots: bolinhas verdes/pendentes — só se o dado de status vier via props; senão omitir */}
      </div>
      <Link href={`/pacientes/${patient.id}/documentos`} className="text-xs font-semibold text-primary hover:underline">
        Ver documentos →
      </Link>
    </div>
  </Card>

  {/* coluna de tratamentos */}
  <div>
    <div className="mb-3 flex items-center justify-between">
      <SectionLabel>Tratamentos</SectionLabel>
      <Button size="sm" onClick={() => setTreatmentFormOpen(true)}><Plus /> Novo tratamento</Button>
    </div>
    {treatments.length === 0 ? (
      <Card><EmptyState icon={FileText} title="Nenhum tratamento registrado"
        action={<Button size="sm" variant="outline" onClick={() => setTreatmentFormOpen(true)}>Novo tratamento</Button>} /></Card>
    ) : (
      <div className="flex flex-col gap-3">
        {treatments.map((t) => (
          <Link key={t.id} href={`/pacientes/${patient.id}/tratamentos/${t.id}`}
            className="flex items-center gap-3.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-foreground/20">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm font-medium">{t.woundTypes}</b>
                <Badge variant={t.status === "concluido" ? "secondary" : "default"}
                  className={t.status === "concluido" ? undefined : "bg-warn-soft text-warn"}>
                  {t.status === "concluido" ? "Concluído" : "Em andamento"}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Iniciado em {formatDate(t.startedOn)}
              </span>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    )}
  </div>
</div>
```

Notas:
- `initials`/`calculateAge` — importar/inline como na Task 11. Se `calculateAge` vive só em `patients-client.tsx`, mover para `src/modules/crm/` ou `src/lib/` um helper compartilhado é aceitável (é pura, sem lógica de dados) — ou inline. Decidir uma vez.
- `doc-dots` e a linha "2 de 3 termos assinados": só se `PatientDetailClient` receber esse dado. Hoje não recebe. Omitir e deixar só o link "Ver documentos →". Não adicionar query.
- O `<section>` "Dados do paciente" atual (com o `<dl>` inline) é substituído pelo trilho de identidade. O botão "Editar dados" vai para o `action` do header ou para um botão outline no topo da coluna direita.

- [ ] **Step 3: Testes + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: verde.

- [ ] **Step 4: Conferência visual**

`/pacientes/<id>`: breadcrumbs; trilho de identidade sticky à esquerda; tratamentos como cards clicáveis com chevron; estado vazio com chip.

- [ ] **Step 5: Commit**

```bash
git add src/components/patients/patient-detail-client.tsx src/app/(app)/pacientes/[id]/page.tsx
git commit -m "refactor(ui): detalhe do Paciente no padrão do redesenho"
```

---

### Task 13: Tratamento — detalhe

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/page.tsx`
- Modify: `src/components/treatments/treatment-detail-client.tsx`
- Mockup: `<!-- ---- TRATAMENTO: detalhe ---- -->`

**Preservar:** todos os `useState` (`treatment/woundTypes/woundDetails/treatmentType/assessment/perception/saving/error/concludeOpen/confirmingDelete/deleting`); `router`; `isDone`; `handleDelete`; `handleSave`; `updateTreatmentAction`; `deleteTreatmentAction`; `ConcludeTreatmentDialog`; `<TreatmentPhotos>`; `OUTCOME_LABELS`; `formatDate`; `sessionsLabel`; a lista de `sessions`.

**Interfaces:**
- Consumes: `PageHeader` (eyebrow "Tratamento"), `Breadcrumbs`, `Card/CardHeader/CardTitle/CardContent`, `Badge`, `Button`, `Input`, `Label`, `Textarea`, `RowActionsMenu` (para "Excluir tratamento"), `EmptyState`, `Printer`/`ChevronRight` de lucide.

- [ ] **Step 1: Cabeçalho + breadcrumbs + meta-row**

`[treatmentId]/page.tsx`: `<Breadcrumbs items={[{label:"Pacientes",href:"/pacientes"},{label:"<nome>",href:`/pacientes/${id}`},{label:"Tratamento"}]} />` — o nome do paciente precisa vir para o `page.tsx` (já busca `treatment`; se `treatment` tem `contactName`, usar; senão fazer `getPatientAction(id)` — **isso é leitura de dado novo**; se não quiser, usar rótulo genérico "Paciente" ou só `["Pacientes", "Tratamento"]`). Preferir `["Pacientes" › "Tratamento"]` sem o nome se o dado não estiver à mão.

`PageHeader` com `eyebrow="Tratamento"`, `title={treatment.woundTypes}`. A `meta-row` (badge status · Início dd/mm · N sessões) e as ações (Concluir / Imprimir relatório / ⋯ Excluir) vão para o topo do `TreatmentDetailClient` (têm handlers). Reescrever o bloco atual `<div className="flex flex-wrap items-center gap-3 …">`:

```tsx
<div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-2">
  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <Badge variant={isDone ? "secondary" : "default"}
      className={isDone ? undefined : "bg-warn-soft text-warn"}>
      {isDone ? "Concluído" : "Em andamento"}
    </Badge>
    <span className="size-1 rounded-full bg-border" />
    <span>Início {formatDate(treatment.startedOn)}</span>
    <span className="size-1 rounded-full bg-border" />
    <span>{sessionsLabel(sessionCount)}</span>
    {isDone && treatment.dischargedOn && (
      <>
        <span className="size-1 rounded-full bg-border" />
        <span>Alta {formatDate(treatment.dischargedOn)} — {OUTCOME_LABELS[treatment.outcome ?? ""] ?? treatment.outcome}</span>
      </>
    )}
  </div>
  <div className="flex items-center gap-2">
    {!isDone && (
      <Button type="button" variant="outline" onClick={() => setConcludeOpen(true)}>Concluir tratamento</Button>
    )}
    <Link href={`/pacientes/${contactId}/tratamentos/${treatment.id}/relatorio`}>
      <Button type="button"><Printer /> Imprimir relatório</Button>
    </Link>
    <RowActionsMenu
      triggerLabel="Mais ações"
      actions={[]}
      destructive={{
        label: "Excluir tratamento", icon: Trash2,
        confirmText: sessionCount === 1
          ? "Excluir este tratamento? 1 sessão deixará de estar vinculada. Esta ação não pode ser desfeita."
          : `Excluir este tratamento? ${sessionCount} sessões deixarão de estar vinculadas. Esta ação não pode ser desfeita.`,
        confirmLabel: "Excluir",
        onConfirm: handleDelete,
      }}
    />
  </div>
</div>
```

Isso substitui o `confirmingDelete` inline atual. `confirmingDelete`/`setConfirmingDelete` podem sair (órfãos gerados pela mudança) — remover o `useState` e o bloco JSX de confirmação. `deleting` continua (desabilita durante a ação) — o `RowActionsMenu` não expõe `disabled`; aceitável, `handleDelete` já navega ao terminar.

- [ ] **Step 2: Formulário seccionado (card)**

Envolver os campos num `Card` com 3 seções separadas por `border-b`, cada uma com um rótulo (`text-[11px] font-bold uppercase tracking-wide text-muted-foreground`):
- **Ferida**: `Tipos de ferida` (Input) + `Localização` (Input — **campo novo?** o mockup mostra "Localização"; se `Treatment` não tem esse campo, **omitir**, não adicionar campo) + `Detalhes da ferida` (Textarea, largura total).
- **Tratamento**: `Tipo de tratamento / conduta` (Input, largura total) — mapeia `treatmentType`.
- **Avaliação**: `Avaliação da profissional` (Textarea) + `Percepção do paciente` (Textarea).
- Rodapé do card: `<Button onClick={handleSave} disabled={saving}>` + `<Button variant="ghost">Descartar</Button>` (reseta os `useState` para os valores de `treatment`) + `<span className="ml-auto text-xs text-muted-foreground">` com "Última edição…" se houver dado (senão omitir).

Grid interno: `grid gap-4 sm:grid-cols-2`, campos de largura total com `sm:col-span-2`.

- [ ] **Step 3: Sessões e fotos**

- "Sessões realizadas" num `Card` com `CardHeader`/`CardTitle` + nota "N sessões". Lista vira uma timeline: cada item `flex gap-3 border-b py-2.5 last:border-0`, `<span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{data}</span>` + `<span className="text-sm">{notes}</span>`. Vazio → `<EmptyState icon={Activity} title="Nenhuma sessão concluída vinculada" />`.
- `<TreatmentPhotos>` — **não reescrever aqui**; é componente próprio com upload. Se der tempo/escopo, uma Task futura aplica a grade com tile "Adicionar foto" tracejado do mockup. Por ora, envolver em `Card` + `CardHeader`/`CardTitle` "Fotos da evolução" se ainda não estiver.

- [ ] **Step 4: Testes + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: verde. `prepare-photo.test.ts` não é afetado.

- [ ] **Step 5: Conferência visual**

`/pacientes/<id>/tratamentos/<tid>`: breadcrumbs; meta-row com pontinhos separadores; ações ancoradas (Concluir / Imprimir / ⋯); form em card com 3 seções rotuladas; timeline de sessões; excluir confirma no popover.

- [ ] **Step 6: Commit**

```bash
git add src/components/treatments/treatment-detail-client.tsx "src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/page.tsx"
git commit -m "refactor(ui): detalhe do Tratamento no padrão do redesenho"
```

---

### Task 14: Documentos / Consentimentos

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/documentos/page.tsx`
- Modify: `src/components/consents/consent-cards.tsx`
- Mockup: `<!-- ---- DOCUMENTOS ---- -->`

**Preservar:** toda a lógica de `consent-cards.tsx` (assinatura, envio de link, estados de doc assinado/pendente, `professionalMissing`, geração de PDF, `initialConsents`, `docs`). Ler o arquivo inteiro antes de mexer — 266 linhas.

**Interfaces:**
- Consumes: `PageHeader` (eyebrow "Documentos", title "Consentimentos"), `Breadcrumbs`, `Card`, `Button`, `TriangleAlert`/`FileText`/`Link2` de lucide.

- [ ] **Step 1: Ler `consent-cards.tsx` inteiro**

Run: abrir o arquivo. Mapear: como cada termo é renderizado hoje, onde está o botão de assinar, onde o de enviar link, como `professionalMissing` é exibido, se há um painel de QR/link.

- [ ] **Step 2: Cabeçalho + breadcrumbs**

`documentos/page.tsx`: `<Breadcrumbs items={[{label:"Pacientes",href:"/pacientes"},{label:data.patientName,href:`/pacientes/${id}`},{label:"Documentos"}]} />`. `PageHeader` com `eyebrow="Documentos"`, `title="Consentimentos"`, `description="Termos assinados pela paciente. O PDF guarda a assinatura e a data."` (o title deixa de embutir o nome do paciente — ele está no breadcrumb).

- [ ] **Step 3: Banner de registro no conselho**

Quando `professionalMissing`, renderizar no topo do `ConsentCards`:

```tsx
<div className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-3 text-sm text-warn">
  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
  <span>
    Seu registro no conselho ainda não está preenchido. Complete em{" "}
    <Link href="/configuracoes" className="font-bold underline">Configurações</Link>{" "}
    para que apareça no rodapé dos termos.
  </span>
</div>
```

- [ ] **Step 4: Linhas de documento**

Cada termo vira uma `doc-row` dentro de um único `Card` (separadas por `border-b`, `last:border-0`): título em `text-sm font-medium` + subtítulo (`Assinado em dd/mm/aaaa por <nome>` em `text-xs text-muted-foreground`, ou `Pendente de assinatura` em `text-warn`). Ações à direita: se assinado → "Ver PDF" (link-btn) + "Enviar link" (outline sm) + "Assinar de novo" (outline sm) + ⋯ com "Excluir documento". Se pendente → "Enviar link" (outline sm) + "Assinar agora" (primary sm) + ⋯. **Manter os handlers atuais** — só reorganizar o JSX e trocar classes.

- [ ] **Step 5: Painel de link/QR (se existir no fluxo atual)**

Se o componente já gera um link/QR ao clicar "Enviar link", estilizar como o `sharelink` do mockup: `Card` com QR à esquerda (`size-28`) + corpo à direita (título + `<input readonly>` mono com o URL + botão "Copiar" + texto "O link expira em 48 horas…"). Se o fluxo atual abre um dialog, **não trocar por painel** — só aplicar as classes do DS ao dialog. Não mudar comportamento.

- [ ] **Step 6: Testes + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: verde. `consent-sign-form.test.tsx` e `pdf.test.ts` devem continuar passando — se algum quebrar, é sinal de que a lógica foi tocada: reverter e refazer só o JSX.

- [ ] **Step 7: Conferência visual + funcional**

`/pacientes/<id>/documentos`: breadcrumbs; banner âmbar quando falta registro; 3 termos em linhas num card com ações à direita; **assinar um termo ainda funciona** (testar o fluxo real de assinatura); enviar link ainda funciona.

- [ ] **Step 8: Commit**

```bash
git add src/components/consents/consent-cards.tsx "src/app/(app)/pacientes/[id]/documentos/page.tsx"
git commit -m "refactor(ui): tela de Documentos no padrão do redesenho"
```

---

## Self-Review (feito na escrita do plano)

**1. Cobertura vs. mockup — cada seção tem tarefa?**
- WhatsApp Inbox → Task 10 ✅ (strip, painel, chat, estado desconectado)
- Pacientes lista → Task 11 ✅ (toolbar, selbar, tabela, ⋯)
- Paciente detalhe → Task 12 ✅ (breadcrumb, trilho de identidade, cards de tratamento)
- Tratamento detalhe → Task 13 ✅ (breadcrumb, meta-row, form seccionado, timeline; grade de fotos = follow-up anotado)
- Documentos → Task 14 ✅ (breadcrumb, banner, doc-rows, painel de link)
- Procedimentos → Task 8 ✅ (tabela, linha em edição, rodapé add)
- Configurações → Task 9 ✅ (coluna estreita, cards seccionados, meter; card "Conta" condicionado a dados)
- Primitivos transversais (eyebrow, breadcrumbs, ⋯ menu, tabela, selbar, empty, meter, section-label) → Tasks 1–7 ✅

**2. Placeholders:** os "TODO" restantes no plano são **decisões de dados deliberadamente fora de escopo** (coluna "último tratamento" na lista, doc-dots no detalhe, card "Conta", grade de fotos, localização da ferida) — todos com instrução explícita de **não** adicionar query/campo e anotar como follow-up. Não são lacunas de implementação de UI.

**3. Consistência de tipos/nomes:** `RowActionsMenu` (`actions: RowAction[]`, `destructive?: DestructiveAction`) usado igual nas Tasks 8, 11, 13, 14. `Table/THead/TH/TBody/TR/TD/RowActionsCell` idem nas Tasks 8 e 11. `PageHeader` ganha `eyebrow?` opcional — compatível com todas as chamadas atuais. `SelectionBar`/`EmptyState`/`Meter`/`DescriptionList`/`SectionLabel`/`Breadcrumbs` com as assinaturas das Tasks 2–7.

**4. Riscos conhecidos:**
- API real do `@base-ui/react/menu` pode divergir dos nomes usados (Task 4 Step 1 obriga a checar antes; Task 5 tem nota sobre `closeOnClick`).
- Padrão "ação primária no `PageHeader` vs. dentro do client" — o plano manda **escolher um** e repetir; recomendação: toolbar no client (funciona com RSC sem gambiarra).
- `initials`/`calculateAge`/`formatBRL` espalhados — o plano permite extrair para `src/lib/utils.ts` se trivial e usado 3+ vezes; senão inline. Não bloquear.

---

## Execution Handoff

Plano salvo em `docs/superpowers/plans/2026-09-03-redesenho-telas.md`. O usuário pediu para **deixar salvo e continuar depois** — não iniciar execução agora.

Quando retomar, duas opções:

1. **Subagent-Driven (recomendado)** — REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Um subagente por tarefa, revisão entre tarefas. Começar pela Fase A (Tasks 1–7, ordem importa) e depois Fase B na ordem Task 8 → 14 (Procedimentos primeiro por ser a menor prova do padrão).
2. **Inline** — REQUIRED SUB-SKILL: `superpowers:executing-plans`. Execução em lote com checkpoints.

Antes de executar, criar worktree isolado via `superpowers:using-git-worktrees`.
