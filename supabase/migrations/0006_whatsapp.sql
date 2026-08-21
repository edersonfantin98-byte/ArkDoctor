create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid references contacts(id),
  contact_name text not null,
  contact_phone text not null,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  sent_at timestamptz not null default now()
);

alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

create policy "account members can manage whatsapp_conversations"
  on whatsapp_conversations for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage whatsapp_messages"
  on whatsapp_messages for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create index whatsapp_messages_conversation_id_idx on whatsapp_messages (conversation_id, sent_at);
