-- Runs automatically on first container start (mounted at
-- /docker-entrypoint-initdb.d, the pgvector/pgvector image's standard
-- Postgres init-script hook — skipped on subsequent starts once
-- postgres_data already has an initialized cluster).
CREATE EXTENSION IF NOT EXISTS vector;
