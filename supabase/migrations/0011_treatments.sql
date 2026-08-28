-- Feature: Tratamento + Relatório clínico (feridas / ozonioterapia).
-- Per-wound treatment entity, weak link from appointments, private photo
-- bucket, and professional-identity fields on accounts.

create table treatments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  wound_types text not null,
  wound_details text,
  treatment_type text,
  started_on date not null,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluido')),
  discharged_on date,
  outcome text
    check (outcome in ('cicatrizacao', 'alta', 'abandono', 'encaminhamento')),
  professional_assessment text,
  patient_perception text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index treatments_account_contact_idx on treatments (account_id, contact_id);

create table treatment_photos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  treatment_id uuid not null references treatments(id) on delete cascade,
  storage_path text not null,
  bytes integer not null,
  caption text,
  taken_on date,
  created_at timestamptz not null default now()
);

create index treatment_photos_treatment_idx on treatment_photos (treatment_id);
create index treatment_photos_account_idx on treatment_photos (account_id);

alter table appointments
  add column treatment_id uuid references treatments(id) on delete set null;

create index appointments_treatment_idx on appointments (treatment_id);

alter table accounts
  add column professional_name text,
  add column professional_council_id text;

alter table treatments enable row level security;
alter table treatment_photos enable row level security;

create policy "account members can manage treatments"
  on treatments for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage treatment_photos"
  on treatment_photos for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

-- accounts currently has SELECT-only RLS (0001). /configuracoes needs to
-- write professional_name / professional_council_id.
create policy "account members can update their account"
  on accounts for update
  to authenticated
  using (id in (select account_id from account_users where user_id = auth.uid()))
  with check (id in (select account_id from account_users where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('treatment-photos', 'treatment-photos', false)
on conflict (id) do nothing;

create policy "account members manage treatment photo objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'treatment-photos'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'treatment-photos'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
