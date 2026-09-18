export interface InstallmentParcel {
  number: number;
  amount: number;
  dueDate: string;
}

export function buildInstallments(
  totalAmount: number,
  count: number,
  firstDueDate: string,
): InstallmentParcel[] {
  const [year, month, day] = firstDueDate.split("-").map(Number);
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / count);

  return Array.from({ length: count }, (_, i) => {
    const cents = i === count - 1 ? totalCents - baseCents * (count - 1) : baseCents;
    const lastDay = new Date(Date.UTC(year, month - 1 + i + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(year, month - 1 + i, Math.min(day, lastDay)));
    return { number: i + 1, amount: cents / 100, dueDate: due.toISOString().slice(0, 10) };
  });
}
