-- Records pg_partman's presence (ADR-028) in Prisma's migration history,
-- mirroring 20260730105822_record_vector_extension's pattern: the
-- extension itself is installed by the postgres Docker image
-- (infrastructure/docker/postgres/Dockerfile, added in this same task)
-- and enabled by docker-compose's init script
-- (infrastructure/docker/postgres-init/02-pg-partman.sql), predating this
-- migration -- this statement is a no-op against the live database
-- (IF NOT EXISTS) and exists purely so replaying migration history into a
-- fresh shadow database produces a schema matching the live one.
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
