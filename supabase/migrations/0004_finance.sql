create table procedures (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  default_price numeric(10,2) not null check (default_price > 0),
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table financial_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('revenue', 'expense')),
  amount numeric(10,2) not null check (amount > 0),
  default_amount numeric(10,2),
  category text,
  procedure_id uuid references procedures(id),
  -- No FK yet: the `appointments` table does not exist in this branch.
  -- Reserved for the future Appointment -> FinancialEntry integration.
  appointment_id uuid,
  description text,
  occurred_at date not null,
  created_at timestamptz not null default now(),
  constraint financial_entries_expense_no_procedure
    check (type <> 'expense' or procedure_id is null)
);

alter table procedures enable row level security;
alter table financial_entries enable row level security;

create policy "account members can manage procedures"
  on procedures for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage financial_entries"
  on financial_entries for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));
