import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — add it to your .env file');
}

const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.delete('sslmode');
dbUrl.searchParams.delete('channel_binding');

const pool = new Pool({
  connectionString: dbUrl.toString(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: { rejectUnauthorized: true },
});

export const db = drizzle(pool, { schema });

export { pool };
