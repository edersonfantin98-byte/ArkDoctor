create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table account_users (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  primary key (account_id, user_id)
);

alter table accounts enable row level security;
alter table account_users enable row level security;

create policy "account members can read their account"
  on accounts for select
  using (id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can read their membership rows"
  on account_users for select
  using (user_id = auth.uid());
