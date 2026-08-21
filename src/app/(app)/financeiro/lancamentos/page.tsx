import { listFinancialEntriesAction } from "../actions";
import { listProceduresAction } from "@/app/(app)/agenda/actions";
import { EntriesClient } from "@/components/finance/entries-client";
import { PageHeader } from "@/components/layout/page-header";

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function EntriesPage() {
  const range = currentMonthRange();
  const [entries, procedures] = await Promise.all([
    listFinancialEntriesAction(range),
    listProceduresAction(),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Lançamentos"
        description="Receitas e despesas do mês atual."
      />
      <EntriesClient initialEntries={entries} procedures={procedures} range={range} />
    </div>
  );
}
