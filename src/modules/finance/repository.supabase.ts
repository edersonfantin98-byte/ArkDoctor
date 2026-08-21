import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FinanceRepository } from "./repository";
import type { FinancialEntry, FinancialEntryType } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[finance/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toFinancialEntry(
  row: Database["public"]["Tables"]["financial_entries"]["Row"],
): FinancialEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type as FinancialEntryType,
    amount: Number(row.amount),
    defaultAmount: row.default_amount === null ? null : Number(row.default_amount),
    category: row.category,
    procedureId: row.procedure_id,
    appointmentId: row.appointment_id,
    description: row.description,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseFinanceRepository(
  supabase: SupabaseClient<Database>,
): FinanceRepository {
  return {
    async insertFinancialEntry(accountId, input) {
      const { data, error } = await supabase
        .from("financial_entries")
        .insert({
          account_id: accountId,
          type: input.type,
          amount: input.amount,
          default_amount: input.defaultAmount,
          category: input.category,
          procedure_id: input.procedureId,
          appointment_id: input.appointmentId,
          description: input.description,
          occurred_at: input.occurredAt,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toFinancialEntry(data);
    },

    async listFinancialEntries(accountId, range) {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("account_id", accountId)
        .gte("occurred_at", range.from)
        .lte("occurred_at", range.to)
        .order("occurred_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toFinancialEntry);
    },

    async getFinancialEntryByAppointmentId(accountId, appointmentId) {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("account_id", accountId)
        .eq("appointment_id", appointmentId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toFinancialEntry(data) : null;
    },
  };
}
