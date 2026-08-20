create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  phone text not null,
  origin text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type pipeline_stage_kind as enum ('normal', 'follow_up', 'lost');

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  kind pipeline_stage_kind not null default 'normal',
  position integer not null
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  stage_id uuid not null references pipeline_stages(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id),
  to_stage_id uuid not null references pipeline_stages(id),
  moved_at timestamptz not null default now()
);

alter table contacts enable row level security;
alter table pipeline_stages enable row level security;
alter table deals enable row level security;
alter table deal_stage_history enable row level security;

create policy "account members can manage contacts"
  on contacts for all
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage pipeline_stages"
  on pipeline_stages for all
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage deals"
  on deals for all
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage deal_stage_history"
  on deal_stage_history for all
  using (
    deal_id in (
      select id from deals where account_id in (
        select account_id from account_users where user_id = auth.uid()
      )
    )
  )
  with check (
    deal_id in (
      select id from deals where account_id in (
        select account_id from account_users where user_id = auth.uid()
      )
    )
  );

create function seed_default_pipeline_stages(target_account_id uuid)
returns void
language sql
as $$
  insert into pipeline_stages (account_id, name, kind, position) values
    (target_account_id, 'Novo Lead', 'normal', 0),
    (target_account_id, 'Em Negociação', 'normal', 1),
    (target_account_id, 'Agendado', 'normal', 2),
    (target_account_id, 'Atendido', 'normal', 3),
    (target_account_id, 'Follow-up', 'follow_up', 4),
    (target_account_id, 'Perdido', 'lost', 5);
$$;
