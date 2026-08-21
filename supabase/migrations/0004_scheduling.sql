create table procedures (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  default_price numeric(10,2) not null,
  default_duration_minutes integer not null,
  created_at timestamptz not null default now()
);

create type appointment_status as enum (
  'agendado', 'confirmado', 'concluido', 'nao_compareceu', 'cancelado'
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  procedure_id uuid not null references procedures(id),
  deal_id uuid references deals(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'agendado',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text
);

create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  reason text
);

create index appointments_account_range_idx on appointments (account_id, starts_at, ends_at);

alter table procedures enable row level security;
alter table appointments enable row level security;
alter table availability_blocks enable row level security;
alter table availability_rules enable row level security;

create policy "account members can manage procedures"
  on procedures for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage appointments"
  on appointments for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage availability_blocks"
  on availability_blocks for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage availability_rules"
  on availability_rules for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));
