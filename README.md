# ArkDoctor

Sistema de gestão para profissionais de saúde autônomos: CRM/Pipeline, Agendamento, Financeiro e WhatsApp Inbox centralizados em um só lugar.

Contexto completo do produto: `docs/prd/arkdoctor-prd.md` (ver seção "Estado Atual da Implementação" para o que já está construído e os gaps conhecidos). Decisões técnicas: `docs/superpowers/specs/`.

## Stack

- Next.js 16 (App Router) + TypeScript
- Supabase (Postgres + Auth), acesso via `@supabase/supabase-js`/`@supabase/ssr`, sem ORM
- Tailwind CSS + Base UI (`@base-ui/react`)
- Vitest + React Testing Library
- Deploy: Cloudflare Pages via `@opennextjs/cloudflare`

## Rodando localmente

1. Copie `.env.local.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — do projeto Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY` — usada só no servidor (webhook do WhatsApp e o fluxo de autoagendamento público em `/agendar`, que não tem sessão de login), nunca exposta ao browser.
   - `NEXT_PUBLIC_APP_URL` — URL pública onde a app está acessível (a Uazapi chama de volta essa URL para entregar mensagens recebidas).
2. Aplique as migrations em `supabase/migrations/` no projeto Supabase (`supabase db push`, ou colando manualmente no SQL editor — ver `supabase/migrations/README.md` para o que já está aplicado em produção).
3. Crie o usuário no Supabase Auth e vincule a uma `Account` — não há cadastro self-service; siga `supabase/seed_account.sql`.
4. `npm install && npm run dev` — abre em `http://localhost:3000`.

## Comandos

```bash
npm run dev      # servidor de desenvolvimento (Turbopack)
npm run build    # build de produção
npm run start    # roda o build de produção localmente
npm run lint     # ESLint
npm test         # vitest run (159 testes)
npm run deploy   # build + deploy no Cloudflare Pages via Wrangler
```

## Segurança

CSP com nonce por request e guarda de autenticação de rota vivem em `src/proxy.ts` (não `middleware.ts` — o Next 16 renomeou o arquivo e ele precisa ficar dentro de `src/`, ao lado de `app/`). RLS do Postgres habilitada em todas as tabelas de domínio, com policies por `account_id`.
