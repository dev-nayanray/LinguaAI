import { defineConfig } from 'prisma/config';

// package.json#prisma is deprecated (removed in Prisma 7) — see
// https://pris.ly/prisma-config. DATABASE_URL itself is still injected via
// `dotenv -e ../../.env` in package.json's db:generate/db:migrate scripts,
// then read by schema.prisma's own `env("DATABASE_URL")`, unaffected by
// this config file.
export default defineConfig({
  schema: 'schema.prisma',
});
