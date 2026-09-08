// Valida um CPF brasileiro: 11 dígitos + os dois dígitos verificadores.
// Aceita pontuação (pontos e traço); qualquer outro caractere invalida.
// Não trata string vazia como válida — quem permite CPF ausente checa isso antes.
export function isValidCpf(value: string): boolean {
  if (!/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(value.trim())) return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}
