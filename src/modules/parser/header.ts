import { Client } from 'pg';
import { db } from '../../db/client';
import { columnAliases } from '../../db/schema';
import { CanonicalField } from '../../types';
import { logger } from '../../utils/logger';

const VALID_CANONICAL_FIELDS = new Set<string>([
  'customer_name', 'phone', 'last_purchase_date', 'amount', 'category',
]);

let aliasCache: Map<string, CanonicalField> | null = null;

export async function startAliasListener(): Promise<void> {
  const dbUrl = new URL(process.env.DATABASE_URL!);
  dbUrl.searchParams.delete('sslmode');
  dbUrl.searchParams.delete('channel_binding');

  const client = new Client({
    connectionString: dbUrl.toString(),
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();
  await client.query('LISTEN aliases_changed');

  logger.db('LISTEN aliases_changed — cache will auto-invalidate on table changes');

  client.on('notification', (msg) => {
    if (msg.channel === 'aliases_changed') {
      aliasCache = null;
      logger.db('aliases_changed notification received — cache cleared');
    }
  });

  client.on('error', (err) => {
    logger.db(`LISTEN connection error: ${err.message} — reconnecting in 5s`);
    setTimeout(() => startAliasListener(), 5_000);
  });

  client.on('end', () => {
    logger.db('LISTEN connection closed — reconnecting in 5s');
    setTimeout(() => startAliasListener(), 5_000);
  });
}

export async function loadAliasMap(): Promise<Map<string, CanonicalField>> {
  if (aliasCache) {
    logger.db(`  ├─ Cache check   → HIT  (${aliasCache.size} aliases ready, no DB query)`);
    return aliasCache;
  }

  logger.db('  ├─ Cache check   → MISS (first load or table was updated)');
  logger.db('  ├─ Source        → Neon PostgreSQL  (column_aliases table)');
  logger.db('  ├─ Query         → SELECT alias, canonical_field FROM column_aliases');

  const rows = await db.select().from(columnAliases);

  const map = new Map<string, CanonicalField>();
  let skipped = 0;
  for (const row of rows) {
    if (!VALID_CANONICAL_FIELDS.has(row.canonicalField)) {
      logger.db(`  ⚠  Skipping alias "${row.alias}" — unrecognised canonical_field "${row.canonicalField}"`);
      skipped++;
      continue;
    }
    map.set(row.alias.toLowerCase().trim(), row.canonicalField as CanonicalField);
  }
  if (skipped > 0) {
    logger.db(`  ⚠  ${skipped} alias row(s) skipped due to invalid canonical_field value`);
  }

  aliasCache = map;
  logger.db(`  └─ Loaded        → ${map.size} aliases cached (auto-invalidates on DB change)`);

  return map;
}

export function resolveHeaders(
  rawHeaders: string[],
  aliasMap: Map<string, CanonicalField>
): {
  columnMap: Map<string, CanonicalField>;
  unmapped: string[];
  mappedFields: Set<CanonicalField>;
} {
  const columnMap    = new Map<string, CanonicalField>();
  const mappedFields = new Set<CanonicalField>();
  const unmapped: string[] = [];

  for (const header of rawHeaders) {
    const canonical = aliasMap.get(header.toLowerCase().trim());
    if (canonical) {
      columnMap.set(header, canonical);
      mappedFields.add(canonical);
    } else {
      unmapped.push(header);
    }
  }

  return { columnMap, unmapped, mappedFields };
}
