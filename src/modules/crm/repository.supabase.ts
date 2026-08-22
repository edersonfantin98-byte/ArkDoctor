import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CrmRepository } from "./repository";
import type {
  Contact,
  Deal,
  DealStageHistoryEntry,
  DealWithContact,
  PipelineStage,
} from "./types";

// Never surface raw Postgres/PostgREST error details (column names, constraint
// names, query internals) to the client — log them server-side and throw a
// generic message instead.
function throwDbError(error: PostgrestError): never {
  console.error("[crm/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toContact(row: Database["public"]["Tables"]["contacts"]["Row"]): Contact {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    phone: row.phone,
    origin: row.origin,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStage(row: Database["public"]["Tables"]["pipeline_stages"]["Row"]): PipelineStage {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    kind: row.kind,
    position: row.position,
  };
}

function toDeal(row: Database["public"]["Tables"]["deals"]["Row"]): Deal {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    stageId: row.stage_id,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function toHistory(
  row: Database["public"]["Tables"]["deal_stage_history"]["Row"],
): DealStageHistoryEntry {
  return {
    id: row.id,
    dealId: row.deal_id,
    fromStageId: row.from_stage_id,
    toStageId: row.to_stage_id,
    movedAt: row.moved_at,
  };
}

export function createSupabaseCrmRepository(
  supabase: SupabaseClient<Database>,
): CrmRepository {
  return {
    async getStages(accountId) {
      // `kind` must sort before `position`: follow_up/lost must always sort last
      // regardless of numeric position (see Task 13). The pipeline_stage_kind enum
      // is declared as ('normal', 'follow_up', 'lost') in 0002_crm.sql, and Postgres
      // enums order by declaration order under a plain ORDER BY, so ordering by
      // `kind` ascending puts normal stages first, matching the in-memory repo's fix.
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("account_id", accountId)
        .order("kind", { ascending: true })
        .order("position", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toStage);
    },

    async getStage(accountId, stageId) {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", stageId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toStage(data) : null;
    },

    async insertStage(accountId, name, position) {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .insert({ account_id: accountId, name, kind: "normal", position })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toStage(data);
    },

    async renameStage(accountId, stageId, name) {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .update({ name })
        .eq("account_id", accountId)
        .eq("id", stageId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toStage(data);
    },

    async reorderNormalStages(accountId, orderedIds) {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from("pipeline_stages")
          .update({ position: index })
          .eq("account_id", accountId)
          .eq("id", id)
          .eq("kind", "normal");
        if (error) throwDbError(error);
      }
    },

    async deleteStage(accountId, stageId) {
      const { error } = await supabase
        .from("pipeline_stages")
        .delete()
        .eq("account_id", accountId)
        .eq("id", stageId);
      if (error) throwDbError(error);
    },

    async countOpenDealsInStage(accountId, stageId) {
      const { count, error } = await supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("stage_id", stageId)
        .is("closed_at", null);
      if (error) throwDbError(error);
      return count ?? 0;
    },

    async insertContact(accountId, input) {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          name: input.name,
          phone: input.phone,
          origin: input.origin ?? null,
          notes: input.notes ?? null,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toContact(data);
    },

    async updateContact(accountId, contactId, input) {
      const { data, error } = await supabase
        .from("contacts")
        .update({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.origin !== undefined ? { origin: input.origin } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", contactId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toContact(data);
    },

    async searchContacts(accountId, query) {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
      if (error) throwDbError(error);
      return data.map(toContact);
    },

    async findContactByPhone(accountId, phone) {
      // phone has no unique constraint, so pick the oldest row deterministically
      // instead of using .maybeSingle() directly (which throws on duplicates).
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .eq("phone", phone)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toContact(data) : null;
    },

    async countNewContacts(accountId, sinceIso, untilIso) {
      let query = supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .gte("created_at", sinceIso);
      if (untilIso !== undefined) {
        query = query.lt("created_at", untilIso);
      }
      const { count, error } = await query;
      if (error) throwDbError(error);
      return count ?? 0;
    },

    async insertDeal(accountId, contactId, stageId) {
      const { data, error } = await supabase
        .from("deals")
        .insert({ account_id: accountId, contact_id: contactId, stage_id: stageId })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toDeal(data);
    },

    async getDeal(accountId, dealId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", dealId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toDeal(data) : null;
    },

    async getOpenDealForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .is("closed_at", null)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toDeal(data) : null;
    },

    async getDealsForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId);
      if (error) throwDbError(error);
      return data.map(toDeal);
    },

    async updateDealStage(accountId, dealId, stageId, closedAt) {
      const { data, error } = await supabase
        .from("deals")
        .update({ stage_id: stageId, closed_at: closedAt })
        .eq("account_id", accountId)
        .eq("id", dealId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toDeal(data);
    },

    async getDealsWithContactsByStage(accountId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*, contact:contacts(*)")
        .eq("account_id", accountId);
      if (error) throwDbError(error);

      const result = new Map<string, DealWithContact[]>();
      for (const row of data) {
        const deal = toDeal(row);
        const contact = toContact(row.contact);
        const list = result.get(deal.stageId) ?? [];
        list.push({ ...deal, contact });
        result.set(deal.stageId, list);
      }
      return result;
    },

    async insertDealHistory(dealId, fromStageId, toStageId) {
      const { data, error } = await supabase
        .from("deal_stage_history")
        .insert({ deal_id: dealId, from_stage_id: fromStageId, to_stage_id: toStageId })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toHistory(data);
    },

    async getDealHistory(dealId) {
      const { data, error } = await supabase
        .from("deal_stage_history")
        .select("*")
        .eq("deal_id", dealId)
        .order("moved_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toHistory);
    },
  };
}
