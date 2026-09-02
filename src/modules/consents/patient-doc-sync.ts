// Liga os docFields do formulário de assinatura (chaveados pela key do
// template) às colunas do cadastro do paciente. Só devolve os campos com
// valor — nunca apaga um dado já existente com string vazia.
export function docFieldsToContactUpdate(
  docFields: Record<string, string>,
): { cpf?: string; rg?: string; address?: string; cityState?: string } {
  const pick = (k: string) => {
    const v = docFields[k]?.trim();
    return v ? v : undefined;
  };
  return {
    cpf: pick("pacienteCpf"),
    rg: pick("pacienteRg"),
    address: pick("pacienteEndereco"),
    cityState: pick("pacienteCidadeUf"),
  };
}
