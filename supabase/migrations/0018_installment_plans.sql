create table installment_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  description text,
  category text not null,
  total_amount numeric(10,2) not null check (total_amount > 0),
  installments int not null check (installments between 2 and 48),
  first_due_date date not null,
  created_at timestamptz not null default now()
);

alter table installment_plans enable row level security;

create policy "account members can manage installment_plans"
  on installment_plans for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

alter table financial_entries
  add column plan_id uuid references installment_plans(id) on delete set null,
  add column installment_number int,
  add constraint financial_entries_plan_only_expense
    check (plan_id is null or type = 'expense');

create index financial_entries_plan_id_idx on financial_entries(plan_id) where plan_id is not null;
