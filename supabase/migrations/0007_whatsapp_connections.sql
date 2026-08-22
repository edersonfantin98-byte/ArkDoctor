create table whatsapp_connections (
  account_id uuid primary key references accounts(id) on delete cascade,
  provider text not null default 'fake',
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected')),
  connected_at timestamptz,
  config jsonb
);

alter table whatsapp_connections enable row level security;

create policy "account members can manage whatsapp_connections"
  on whatsapp_connections for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));
