-- Run manually once per new account, after creating the user in the Supabase Auth dashboard.
-- Replace the two placeholders below, then run this whole file in the Supabase SQL editor.

with new_account as (
  insert into accounts (name) values ('<nome da clínica/profissional>') returning id
)
insert into account_users (account_id, user_id, role)
select id, '<auth-user-uuid-do-painel-supabase>', 'owner' from new_account;

select seed_default_pipeline_stages(
  (select account_id from account_users order by account_id desc limit 1)
);
