alter table contacts
  add column email text,
  add column birth_date date,
  add column cpf text,
  add column sex text check (sex in ('M', 'F')),
  add column guardian_name text,
  add column guardian_phone text,
  add column guardian_relationship text;
