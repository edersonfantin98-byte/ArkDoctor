-- Security hardening: enforce app-level invariants at the database layer so
-- they hold even for clients that bypass the Next.js service layer.

-- 1. deal_stage_history must be append-only: drop the permissive "for all"
--    policy and replace it with select + insert only (no update/delete).
drop policy "account members can manage deal_stage_history" on deal_stage_history;

create policy "account members can read deal_stage_history"
  on deal_stage_history for select
  to authenticated
  using (
    deal_id in (
      select id from deals where account_id in (
        select account_id from account_users where user_id = auth.uid()
      )
    )
  );

create policy "account members can insert deal_stage_history"
  on deal_stage_history for insert
  to authenticated
  with check (
    deal_id in (
      select id from deals where account_id in (
        select account_id from account_users where user_id = auth.uid()
      )
    )
  );

-- 2. Special pipeline stages (follow_up, lost) can only be renamed — never
--    reordered, re-kinded, or deleted. Enforce this with a trigger so it
--    holds regardless of how the row is mutated.
create function prevent_special_stage_mutation()
returns trigger
language plpgsql
security invoker
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.kind <> 'normal' then
      raise exception 'Cannot delete a stage of kind %', OLD.kind;
    end if;
    return OLD;
  end if;

  if OLD.kind <> 'normal' then
    if NEW.kind <> OLD.kind then
      raise exception 'Cannot change the kind of stage %', OLD.id;
    end if;
    if NEW.position <> OLD.position then
      raise exception 'Cannot reorder stage of kind %', OLD.kind;
    end if;
  end if;

  return NEW;
end;
$$;

create trigger trg_prevent_special_stage_mutation
  before update or delete on pipeline_stages
  for each row execute function prevent_special_stage_mutation();

-- 3. A contact can have at most one open deal at a time.
create unique index deals_one_open_per_contact
  on deals (contact_id)
  where closed_at is null;

-- 4. seed_default_pipeline_stages is meant to run only from the manual,
--    elevated-role provisioning flow (see supabase/seed_account.sql) — not
--    as a self-service RPC callable by any authenticated user.
revoke execute on function seed_default_pipeline_stages(uuid) from public;

-- 5. Pin existing policies to the `authenticated` role explicitly. auth.uid()
--    is already NULL for anon requests (so these were not exploitable), but
--    `to authenticated` is current Supabase guidance and avoids relying on
--    NULL-comparison semantics.
alter policy "account members can read their account" on accounts to authenticated;
alter policy "account members can read their membership rows" on account_users to authenticated;
alter policy "account members can manage contacts" on contacts to authenticated;
alter policy "account members can manage pipeline_stages" on pipeline_stages to authenticated;
alter policy "account members can manage deals" on deals to authenticated;
