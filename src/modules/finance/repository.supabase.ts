import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FinanceRepository } from "./repository";
import type { FinancialEntry, FinancialEntryType, Procedure } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[finance/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toProcedure(row: Database["public"]["Tables"]["procedures"]["Row"]): Procedure {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    defaultPrice: Number(row.default_price),
    category: row.category,
    active: row.active,
    createdAt: row.created_at,
  };
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
    async insertProcedure(accountId, input) {
      const { data, error } = await supabase
        .from("procedures")
        .insert({
          account_id: accountId,
          name: input.name,
          default_price: input.defaultPrice,
          category: input.category ?? null,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toProcedure(data);
    },

    async updateProcedure(accountId, procedureId, input) {
      const { data, error } = await supabase
        .from("procedures")
        .update({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.defaultPrice !== undefined ? { default_price: input.defaultPrice } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        })
        .eq("account_id", accountId)
        .eq("id", procedureId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toProcedure(data);
    },

    async getProcedure(accountId, procedureId) {
      const { data, error } = await supabase
        .from("procedures")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", procedureId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toProcedure(data) : null;
    },

    async listProcedures(accountId, options) {
      let query = supabase.from("procedures").select("*").eq("account_id", accountId);
      if (options?.activeOnly) query = query.eq("active", true);
      const { data, error } = await query.order("name", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toProcedure);
    },

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
  };
}
