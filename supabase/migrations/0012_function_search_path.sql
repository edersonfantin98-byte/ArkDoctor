-- Pin search_path on the two functions the Supabase advisor flags as
-- "Function Search Path Mutable". A mutable search_path lets a caller who can
-- create objects in an earlier-resolved schema shadow the names the function
-- body relies on. Both are low-risk today (one is security invoker, the other
-- had execute revoked from public in 0003), but pinning is current guidance.

-- Trigger function: body references no schema objects, so the empty path is safe.
alter function prevent_special_stage_mutation() set search_path = '';

-- Body inserts into public.pipeline_stages unqualified — keep public resolvable.
alter function seed_default_pipeline_stages(uuid) set search_path = public, pg_catalog;
