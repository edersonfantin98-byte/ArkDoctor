-- Renomeia o 3º consentimento: 'lgpd' (placeholder, nunca usado em produção)
-- vira 'laser' (Protocolo de Laserterapia — TCLE). O update deixa a migração
-- idempotente mesmo não havendo linhas 'lgpd'.
alter table signed_consents drop constraint signed_consents_kind_check;

update signed_consents set kind = 'laser' where kind = 'lgpd';

alter table signed_consents
  add constraint signed_consents_kind_check check (kind in ('tcle', 'imagem', 'laser'));
