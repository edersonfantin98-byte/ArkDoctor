# ArkDoctor — Arquitetura & Setup Compartilhado — Design Doc

Status: implementado
Última atualização: 2026-08-22

## Contexto

Este documento é a spec "guarda-chuva" de arquitetura e infraestrutura compartilhada do ArkDoctor. Complementa o PRD (`docs/prd/arkdoctor-prd.md`) e o design doc de produto (`docs/superpowers/specs/2026-08-20-arkdoctor-design.md`), detalhando as decisões técnicas concretas que valem para todas as 4 fases do produto (CRM/Pipeline, Agendamento, Financeiro, WhatsApp Inbox).

Cada fase terá sua própria spec técnica detalhada (schema específico, rotas, componentes) e seu próprio plano de implementação, escritos separadamente. Esta spec cobre apenas o que é comum a todas elas.

## Arquitetura & Stack

- **Framework**: Next.js 16 (App Router), TypeScript. Server Components e Server Actions como padrão de acesso a dados/mutações — evita duplicar API routes quando não há necessidade de um endpoint HTTP separado (ex.: webhook do WhatsApp, que sim precisa de API route).
- **UI**: Tailwind CSS + shadcn/ui (componentes copiados para o projeto e customizáveis) para formulários, diálogos, tabelas, kanban. Recharts para os gráficos do dashboard financeiro. Calendário (dia/semana/mês) construído como componente próprio, sem lib pesada de terceiros — o caso de uso (criar/editar/bloquear horários) é simples o suficiente para não justificar uma dependência como FullCalendar.
- **Banco de dados & Auth**: Supabase (Postgres + Supabase Auth). Acesso via `@supabase/supabase-js` e `@supabase/ssr` diretamente em Server Components/Server Actions — sem camada de ORM adicional. Tipos TypeScript gerados a partir do schema via `supabase gen types typescript`.
- **Segurança de dados**: Row Level Security (RLS) do Postgres habilitada em todas as tabelas de domínio desde o início, com policies baseadas em `account_id`. Mesmo com um único usuário no MVP, isso garante isolamento de dados correto por padrão e evita retrabalho de segurança quando o produto expandir para múltiplas contas/usuários.
- **Proxy / autenticação de rota / CSP**: `src/proxy.ts` (a partir do Next.js 16, o arquivo antes chamado `middleware.ts` foi renomeado para `proxy.ts` — precisa ficar no mesmo nível de `app/`, ou seja, dentro de `src/`, não na raiz do projeto) roda em toda rota não-estática. Gera um nonce por request e define o header `Content-Security-Policy` com `script-src 'self' 'nonce-<valor>' 'strict-dynamic'` (mais `'unsafe-eval'` só em desenvolvimento, exigido pelas ferramentas de debug do React em dev). Um `script-src` sem nonce/`unsafe-inline` bloqueia os scripts inline que o próprio Next injeta para hidratar a página — descoberto via um bug real em produção onde nenhum componente client-side reagia a clique algum. O mesmo arquivo também redireciona para `/login` requisições não-autenticadas às rotas protegidas (`PROTECTED_PREFIXES`: `/pipeline`, `/financeiro`, `/agenda`, `/dashboard`, `/whatsapp`, `/agendamento`, `/procedimentos`).
- **Deploy**: Cloudflare Pages, via adapter OpenNext para Next.js.
- **Testes**: Vitest + React Testing Library. Sem testes end-to-end (Playwright) no MVP — reavaliar se a complexidade de fluxos entre módulos justificar no futuro.

## Modelo de Dados Raiz & Autenticação

- **Account** (entidade raiz de todo o sistema): `id`, `name`, `created_at`. Todas as tabelas de domínio (`Contact`, `PipelineStage`, `Deal`, `Procedure`, `Appointment`, `AvailabilityBlock`, `FinancialEntry`, `Conversation`, `Message`) possuem `account_id` obrigatório (FK para `Account`).
- **`account_users`** (tabela de junção): `account_id`, `user_id` (FK para `auth.users` do Supabase), `role`. Existe desde o MVP mesmo com um único usuário por conta, para não exigir migração de schema quando o multiusuário for implementado — a alternativa (campo `owner_id` direto na `Account`) forçaria uma migração de dados futura.
- **Fluxo de autenticação**: sem cadastro ou recuperação de senha self-service no MVP. O desenvolvedor cria o usuário manualmente no painel do Supabase Auth (email/senha) e cria a `Account` correspondente + o vínculo em `account_users` via script/seed. As credenciais são repassadas manualmente à profissional. A aplicação expõe apenas uma tela de login.
- **RLS**: cada tabela de domínio tem policy equivalente a `account_id IN (SELECT account_id FROM account_users WHERE user_id = auth.uid())`, para SELECT/INSERT/UPDATE/DELETE.

## Estrutura de Repositório & Convenções

```
src/
  app/                    # rotas (App Router): /login, /pipeline, /agenda, /procedimentos,
                           # /financeiro, /whatsapp, /dashboard, /agendamento
  proxy.ts                # CSP por request + guarda de autenticação (ver seção Arquitetura & Stack)
  components/             # componentes React reutilizáveis (components/ui = shadcn)
  modules/
    crm/                  # server actions + lógica de domínio do CRM/Pipeline
    scheduling/           # agendamento/calendário + procedimentos
    finance/              # financeiro/dashboard
    whatsapp/             # adapter + inbox
  lib/
    supabase/             # clients (server, browser) + tipos gerados
  types/
supabase/
  migrations/             # SQL migrations versionadas (Supabase CLI)
```

- Cada módulo de domínio (`modules/<nome>`) contém suas próprias server actions, validação de entrada (Zod) e testes.
- Comunicação entre módulos (ex.: Agendamento → Financeiro ao concluir um `Appointment`) acontece através de funções exportadas explicitamente pelo módulo de destino — nunca por acesso direto a tabelas de outro módulo a partir de um módulo que não é o dono daquela entidade.
- Migrations são SQL puro, escritas manualmente e versionadas via Supabase CLI (sem geração automática por ORM).
- Testes ficam ao lado do código que testam (`*.test.ts`), seguindo o padrão que a fase 1 (CRM/Pipeline) estabelecer, conforme já indicado no PRD.

## Fora de Escopo (desta spec)

- Schema detalhado de cada entidade de domínio (fica nas specs de cada fase).
- Rotas/endpoints e componentes de UI específicos de cada módulo (fica nas specs de cada fase).
- Adapter do WhatsApp (fica na spec da fase 4).

## Decisões em Aberto

- Nenhuma — todas as decisões de arquitetura compartilhada foram fechadas nesta rodada.
