-- The `procedures` table already exists (created by 0004_scheduling.sql on
-- main). This migration only adds the account-scoping guarantee Financeiro
-- needs and creates the new `financial_entries` table.
alter table procedures add constraint procedures_id_account_unique unique (id, account_id);

create table financial_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('revenue', 'expense')),
  amount numeric(10,2) not null check (amount > 0),
  default_amount numeric(10,2),
  category text,
  procedure_id uuid,
  -- No FK yet: the Appointment -> FinancialEntry auto-suggestion flow is a
  -- separate, deliberately deferred follow-up (see the design spec's
  -- "Post-plan note"). appointment_id is reserved for that integration.
  appointment_id uuid,
  description text,
  occurred_at date not null,
  created_at timestamptz not null default now(),
  constraint financial_entries_expense_no_procedure
    check (type <> 'expense' or procedure_id is null),
  constraint financial_entries_procedure_same_account
    foreign key (procedure_id, account_id) references procedures(id, account_id)
);

alter table financial_entries enable row level security;

create policy "account members can manage financial_entries"
  on financial_entries for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));
