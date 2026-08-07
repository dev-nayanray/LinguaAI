-- E5 T11: real grant gap found while building the partition-maintenance
-- BullMQ job (ADR-035, E4 R-69) -- the same privilege-grant class R-72
-- (20260806210659_fix_app_role_grants_and_subscription_rls) already fixed
-- for `public` schema tables, here for the separate `partman` schema.
--
-- Confirmed directly against the live local database, as app_role, before
-- writing this migration (not assumed from reading the extension's docs):
-- `has_schema_privilege('app_role', 'partman', 'USAGE')` returned false,
-- and calling `CALL partman.run_maintenance_proc()` as app_role failed
-- twice in sequence with two distinct real errors -- first
-- "permission denied for schema partman" (schema-level USAGE is a
-- separate grant from any function-level EXECUTE), then, once USAGE was
-- granted, "permission denied for table part_config" (run_maintenance_proc
-- is SECURITY INVOKER, confirmed via `pg_proc.prosecdef = false`, so it
-- runs with app_role's own privileges against pg_partman's internal
-- tracking tables, not the extension owner's). Both gaps exist because
-- `postgres-init/02-pg-partman.sql`'s `CREATE EXTENSION pg_partman SCHEMA
-- partman` only creates the schema/objects -- like the `public` schema
-- before R-72's fix, it grants nothing to app_role beyond Postgres'
-- default (which does not include schema USAGE for a non-public schema).
--
-- Fixed the same two-part way R-72 was: a grant covering pg_partman's
-- existing internal tables/sequences right now, plus `ALTER DEFAULT
-- PRIVILEGES` so a future pg_partman extension upgrade that adds new
-- internal tracking tables doesn't silently reintroduce this gap.
-- EXECUTE on functions/procedures is left at Postgres' own default (PUBLIC
-- has EXECUTE unless explicitly revoked, confirmed via
-- has_function_privilege returning true before any grant was added here)
-- -- only the schema-USAGE and table-level grants were ever actually
-- missing.
GRANT USAGE ON SCHEMA partman TO app_role;
GRANT ALL ON ALL TABLES IN SCHEMA partman TO app_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA partman TO app_role;

ALTER DEFAULT PRIVILEGES FOR ROLE linguaai IN SCHEMA partman
  GRANT ALL ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES FOR ROLE linguaai IN SCHEMA partman
  GRANT ALL ON SEQUENCES TO app_role;
