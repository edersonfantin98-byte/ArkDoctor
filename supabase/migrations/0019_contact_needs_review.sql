-- Contatos criados pelo link público de agendamento ficam marcados para a
-- enfermeira conferir (confirmar cadastro ou vincular a um paciente existente).
alter table contacts
  add column needs_review boolean not null default false;

create index contacts_needs_review_idx
  on contacts (account_id)
  where needs_review;

-- Junta o contato duplicado (source) num paciente existente (target): move tudo
-- que aponta para o source e apaga o source. security invoker: o RLS do chamador
-- vale, então só enxerga contatos da própria conta.
create or replace function merge_contacts(p_source uuid, p_target uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_source contacts%rowtype;
  v_target contacts%rowtype;
  v_target_open_deal uuid;
begin
  if p_source = p_target then
    raise exception 'Escolha um paciente diferente do contato a ser vinculado';
  end if;

  select * into v_source from contacts where id = p_source;
  select * into v_target from contacts where id = p_target;
  if v_source.id is null or v_target.id is null then
    raise exception 'Contato não encontrado';
  end if;
  if v_source.account_id <> v_target.account_id then
    raise exception 'Contatos de contas diferentes';
  end if;

  -- Um contato só pode ter 1 negócio aberto. Se o paciente escolhido já tem,
  -- os agendamentos do duplicado passam para ele e o negócio aberto do
  -- duplicado é descartado; senão o negócio aberto é simplesmente movido.
  select id into v_target_open_deal
    from deals where contact_id = p_target and closed_at is null;

  if v_target_open_deal is not null then
    update appointments
       set deal_id = v_target_open_deal
     where deal_id in (
       select id from deals where contact_id = p_source and closed_at is null
     );
    delete from deals where contact_id = p_source and closed_at is null;
  end if;

  update deals set contact_id = p_target where contact_id = p_source;
  update appointments set contact_id = p_target where contact_id = p_source;
  update treatments set contact_id = p_target where contact_id = p_source;
  update signed_consents set contact_id = p_target where contact_id = p_source;
  update whatsapp_conversations set contact_id = p_target where contact_id = p_source;

  delete from contacts where id = p_source;
end;
$$;

revoke execute on function merge_contacts(uuid, uuid) from public;
grant execute on function merge_contacts(uuid, uuid) to authenticated;
