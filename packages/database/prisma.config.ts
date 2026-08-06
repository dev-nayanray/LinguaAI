import { defineConfig } from 'prisma/config';

// package.json#prisma is deprecated (removed in Prisma 7) — see
// https://pris.ly/prisma-config. DATABASE_URL itself is still injected via
// `dotenv -e ../../.env` in package.json's db:generate/db:migrate scripts,
// then read by the schema's own `env("DATABASE_URL")`, unaffected by this
// config file.
//
// `schema` points at a directory, not a single file — ADR-027 (E4 T1,
// docs/DECISIONS.md): `prismaSchemaFolder` needs no `previewFeatures` flag
// as of Prisma 6.19.3 (verified empirically, not assumed — `prisma
// validate`/`generate` both succeed against a multi-file `schema/`
// directory with no preview feature declared anywhere). One `.prisma` file
// per DATABASE.md domain; `schema/identity.prisma` is E2's original
// `schema.prisma` content, moved here as a pure file-split with zero
// model/field changes.
export default defineConfig({
  schema: 'schema',
});
