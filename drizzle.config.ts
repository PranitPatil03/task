/**
 * drizzle.config.ts — configuration for Drizzle Kit (migration tool)
 *
 * Used by these npm scripts:
 *   npm run db:generate  — generates SQL migration files from schema changes
 *   npm run db:push      — pushes schema directly to DB (good for dev/first setup)
 *   npm run db:studio    — opens Drizzle Studio (visual DB browser)
 *
 * Docs: https://orm.drizzle.team/docs/drizzle-config-file
 */

import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Where your table definitions live
  schema: './src/db/schema.ts',

  // Where generated migration SQL files will be saved
  out: './drizzle/migrations',

  dialect: 'postgresql',

  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
