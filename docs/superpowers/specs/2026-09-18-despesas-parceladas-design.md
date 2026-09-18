# Despesas parceladas — design

## Problema

A Silvana paga boletos/compras em N vezes (ex.: 3x) e não quer lançar manualmente a despesa a cada mês.

## Decisão

Uma **compra parcelada** (`installment_plans`) gera, no ato do cadastro, N lançamentos de despesa
em `financial_entries`, cada um com `occurred_at` = vencimento da parcela. O modelo atual de
lançamento (sempre "realizado", sem status) não muda: como dashboard, histórico de 6 meses e lista
de lançamentos filtram por período, cada parcela só entra nos totais do mês dela. Sem cron, sem status.

Alternativas descartadas: parcelas só viram lançamento ao dar baixa manual (ela não quer o trabalho);
status pendente/pago no lançamento (mexe em todas as consultas de totais).

## Modelo de dados (migração 0018)

`installment_plans`: `id`, `account_id` (FK accounts, cascade), `description`, `category` (obrigatória, como
toda despesa), `total_amount numeric(10,2) > 0`, `installments int` (2..48), `first_due_date date`,
`created_at`. RLS igual a `financial_entries` (membros da conta).

`financial_entries`: novas colunas nulas `plan_id uuid` (FK `installment_plans(id)` on delete set null) e
`installment_number int`. Só despesas podem ter `plan_id` (check constraint).

## Regras

- Valor da parcela = `total / N` arredondado a centavos; a **última parcela absorve a diferença** (R$ 100,00 em 3x → 33,33 / 33,33 / 33,34).
- Vencimentos: mês a mês a partir de `first_due_date`; se o dia não existe no mês (31), usa o último dia do mês.
- Descrição de cada parcela: `"<descrição> (2/3)"`.
- Criação de plano + parcelas em uma única operação atômica (função SQL/RPC), para não ficar plano sem parcelas.
- Editar uma parcela individual: dialog de edição existente (continua valendo, só aquela parcela).
- Excluir compra: duas opções — "excluir parcelas futuras" (`occurred_at > hoje`) ou "excluir todas". O plano é removido quando não sobra parcela.
- Não há edição do plano (total/nº de parcelas): excluir e recriar. (YAGNI)

## UI

- `NewEntryDialog`: para despesa, checkbox "Parcelar" → campos nº de parcelas e vencimento da 1ª parcela; o valor informado é o **total**. Prévia "3x de R$ 100,00".
- Lista de lançamentos: parcelas mostram o rótulo "2/3" e abrem o detalhe da compra (total, já vencido, restante, lista de parcelas, botões de exclusão).
- Toda a UI em pt-BR, no padrão visual atual.

## Testes

- Serviço (vitest): divisão com centavos, vencimento em dia 31, validação (2..48, categoria obrigatória, só despesa).
- Verificar que `dashboard/service.ts` também filtra por período (se houver soma sem limite, limitar).
- Integração manual contra Supabase real: criar 3x, conferir 3 lançamentos e totais por mês.

## Fora de escopo

Parcelamento de receitas, juros, edição do plano, cron/status pendente-pago.
