/**
 * setup-notify-trigger.ts
 *
 * Run this ONCE after deploying to set up the PostgreSQL trigger that powers
 * automatic alias cache invalidation via LISTEN/NOTIFY.
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/setup-notify-trigger.ts
 *
 * What it does:
 *   1. Creates a function notify_aliases_changed() that calls pg_notify
 *   2. Creates a trigger on column_aliases that fires the function on any write
 *
 * After this runs, any INSERT/UPDATE/DELETE on column_aliases will instantly
 * notify the running server to clear its alias cache.
 */

import { pool } from '../src/db/client';

async function setup() {
  console.log('Setting up LISTEN/NOTIFY trigger on column_aliases...');

  await pool.query(`
    CREATE OR REPLACE FUNCTION notify_aliases_changed()
    RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('aliases_changed', '');
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('✓ Function notify_aliases_changed() created');

  await pool.query(`
    DROP TRIGGER IF EXISTS aliases_change_trigger ON column_aliases;
    CREATE TRIGGER aliases_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON column_aliases
    FOR EACH STATEMENT EXECUTE FUNCTION notify_aliases_changed();
  `);
  console.log('✓ Trigger aliases_change_trigger created on column_aliases');

  console.log('\nDone. Any future changes to column_aliases will instantly');
  console.log('invalidate the in-memory alias cache in the running server.');

  await pool.end();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
