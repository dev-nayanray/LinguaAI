-- Runs automatically on first container start (see 01-pgvector.sql's own
-- header comment for the same mechanism/caveat). pg_partman (ADR-028) is
-- installed by infrastructure/docker/postgres/Dockerfile; this only
-- enables the extension. Installed into its own schema per pg_partman's
-- own documented convention, not "public".
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
