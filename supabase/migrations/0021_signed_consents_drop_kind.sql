-- Os 3 termos de consentimento (TCLE, Imagem, Laser) passam a ser assinados
-- juntos, numa única vez: 1 PDF combinado por evento de assinatura, em vez de
-- 1 PDF por termo. A coluna `kind` distinguia os 3 tipos por linha; deixa de
-- fazer sentido. Nenhum paciente assinou pelo fluxo antigo ainda, então não
-- há dado a migrar.
alter table signed_consents drop constraint signed_consents_kind_check;
alter table signed_consents drop column kind;
