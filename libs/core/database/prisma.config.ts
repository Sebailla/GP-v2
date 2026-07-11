// Prisma 7 config for @core/database.
// Per https://www.prisma.io/docs/orm/reference/prisma-config-reference (Prisma 7):
// the datasource URL is no longer declared inside schema.prisma; it lives here.
// The `env()` helper reads from process.env and throws at config-load time if
// the variable is missing — fails-fast by design.
//
// The @core/config package validates DATABASE_URL at import time and is
// imported transitively by apps/api and apps/web before @core/database.
// Therefore we can call `env('DATABASE_URL')` here without further checks.

import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
