-- Feature: assinatura eletrônica dos consentimentos.
-- Um PDF assinado por documento, anexado ao paciente. Espelha o padrão de
-- treatment_photos (bucket privado + RLS por prefixo de account_id).

create table signed_consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('tcle', 'imagem', 'lgpd')),
  storage_path text not null,
  signer_name text not null,
  signed_via text not null check (signed_via in ('inline', 'link')),
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index signed_consents_account_contact_idx
  on signed_consents (account_id, contact_id);

alter table signed_consents enable row level security;

create policy "account members can manage signed_consents"
  on signed_consents for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('signed-consents', 'signed-consents', false)
on conflict (id) do nothing;

create policy "account members manage signed consent objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'signed-consents'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'signed-consents'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
