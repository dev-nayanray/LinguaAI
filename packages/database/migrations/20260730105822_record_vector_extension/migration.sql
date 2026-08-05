-- Records pgvector's presence in Prisma's migration history. The
-- extension itself already exists (installed by docker-compose's Postgres
-- init script per DATABASE.md §1/ARCHITECTURE.md, predating any Prisma
-- migration) -- this statement is a no-op against the live database
-- (IF NOT EXISTS) and exists purely so replaying migration history into a
-- fresh shadow database produces a schema matching the live one, closing
-- the permanent drift found while implementing E2-T2.
CREATE EXTENSION IF NOT EXISTS "vector";
