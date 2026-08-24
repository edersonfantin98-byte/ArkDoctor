import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { SchedulingRepository } from "./repository";
import type { Contact } from "@/modules/crm/types";
import type {
  Appointment,
  AppointmentWithDetails,
  AvailabilityBlock,
  AvailabilityRule,
  Procedure,
} from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[scheduling/repository.supabase]", error);
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
    email: row.email,
    birthDate: row.birth_date,
    cpf: row.cpf,
    sex: row.sex as Contact["sex"],
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    guardianRelationship: row.guardian_relationship,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProcedure(row: Database["public"]["Tables"]["procedures"]["Row"]): Procedure {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    defaultPrice: row.default_price,
    defaultDurationMinutes: row.default_duration_minutes,
    createdAt: row.created_at,
  };
}

function toAppointment(row: Database["public"]["Tables"]["appointments"]["Row"]): Appointment {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    procedureId: row.procedure_id,
    dealId: row.deal_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBlock(row: Database["public"]["Tables"]["availability_blocks"]["Row"]): AvailabilityBlock {
  return {
    id: row.id,
    accountId: row.account_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
  };
}

function toRule(row: Database["public"]["Tables"]["availability_rules"]["Row"]): AvailabilityRule {
  return {
    id: row.id,
    accountId: row.account_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason,
  };
}

export function createSupabaseSchedulingRepository(
  supabase: SupabaseClient<Database>,
): SchedulingRepository {
  return {
    async insertProcedure(accountId, input) {
      const { data, error } = await supabase
        .from("procedures")
        .insert({
          account_id: accountId,
          name: input.name,
          default_price: input.defaultPrice,
          default_duration_minutes: input.defaultDurationMinutes,
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
          ...(input.defaultDurationMinutes !== undefined
            ? { default_duration_minutes: input.defaultDurationMinutes }
            : {}),
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

    async listProcedures(accountId) {
      const { data, error } = await supabase
        .from("procedures")
        .select("*")
        .eq("account_id", accountId)
        .order("name", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toProcedure);
    },

    async deleteProcedure(accountId, procedureId) {
      const { error } = await supabase
        .from("procedures")
        .delete()
        .eq("account_id", accountId)
        .eq("id", procedureId);
      if (error) throwDbError(error);
    },

    async countAppointmentsForProcedure(accountId, procedureId) {
      const { count, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("procedure_id", procedureId);
      if (error) throwDbError(error);
      return count ?? 0;
    },

    async insertAppointment(accountId, input) {
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          account_id: accountId,
          contact_id: input.contactId,
          procedure_id: input.procedureId,
          deal_id: input.dealId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          notes: input.notes,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async getAppointment(accountId, appointmentId) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toAppointment(data) : null;
    },

    async updateAppointmentTime(accountId, appointmentId, startsAt, endsAt) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async updateAppointmentStatus(accountId, appointmentId, status) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async updateAppointmentNotes(accountId, appointmentId, notes) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async listAppointmentsInRange(accountId, from, to) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, contact:contacts(*), procedure:procedures(*)")
        .eq("account_id", accountId)
        .lt("starts_at", to)
        .gt("ends_at", from);
      if (error) throwDbError(error);
      return data.map((row) => ({
        ...toAppointment(row),
        contact: toContact(row.contact),
        procedure: toProcedure(row.procedure),
      })) as AppointmentWithDetails[];
    },

    async listAppointmentsOverlapping(accountId, startsAt, endsAt, excludeAppointmentId) {
      let query = supabase
        .from("appointments")
        .select("*")
        .eq("account_id", accountId)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt);
      if (excludeAppointmentId) {
        query = query.neq("id", excludeAppointmentId);
      }
      const { data, error } = await query;
      if (error) throwDbError(error);
      return data.map(toAppointment);
    },

    async listPendingStatusAppointments(accountId, now) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, contact:contacts(*), procedure:procedures(*)")
        .eq("account_id", accountId)
        .eq("status", "agendado")
        .lt("ends_at", now);
      if (error) throwDbError(error);
      return data.map((row) => ({
        ...toAppointment(row),
        contact: toContact(row.contact),
        procedure: toProcedure(row.procedure),
      })) as AppointmentWithDetails[];
    },

    async insertAvailabilityBlock(accountId, input) {
      const { data, error } = await supabase
        .from("availability_blocks")
        .insert({
          account_id: accountId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          reason: input.reason,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toBlock(data);
    },

    async deleteAvailabilityBlock(accountId, blockId) {
      const { error } = await supabase
        .from("availability_blocks")
        .delete()
        .eq("account_id", accountId)
        .eq("id", blockId);
      if (error) throwDbError(error);
    },

    async listAvailabilityBlocksOverlapping(accountId, startsAt, endsAt) {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .eq("account_id", accountId)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt);
      if (error) throwDbError(error);
      return data.map(toBlock);
    },

    async listAvailabilityBlocks(accountId) {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .eq("account_id", accountId)
        .order("starts_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toBlock);
    },

    async insertAvailabilityRule(accountId, input) {
      const { data, error } = await supabase
        .from("availability_rules")
        .insert({
          account_id: accountId,
          day_of_week: input.dayOfWeek,
          start_time: input.startTime,
          end_time: input.endTime,
          reason: input.reason,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toRule(data);
    },

    async deleteAvailabilityRule(accountId, ruleId) {
      const { error } = await supabase
        .from("availability_rules")
        .delete()
        .eq("account_id", accountId)
        .eq("id", ruleId);
      if (error) throwDbError(error);
    },

    async listAvailabilityRules(accountId) {
      const { data, error } = await supabase
        .from("availability_rules")
        .select("*")
        .eq("account_id", accountId)
        .order("day_of_week", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toRule);
    },
  };
}
