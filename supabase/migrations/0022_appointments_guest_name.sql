-- Permite marcar um agendamento sem ter o paciente cadastrado no CRM: basta
-- um nome digitado na hora. contact_id vira opcional; guest_name guarda o
-- nome livre. Todo agendamento precisa ter um dos dois (nunca os dois juntos,
-- nunca nenhum) — reforçado também na validação (zod) da camada de serviço.
alter table appointments alter column contact_id drop not null;
alter table appointments add column guest_name text;

alter table appointments add constraint appointments_contact_or_guest_check
  check (
    (contact_id is not null and guest_name is null)
    or (contact_id is null and guest_name is not null)
  );
