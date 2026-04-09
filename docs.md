# Code Walkthrough — Billing Data Cleaner

How every part of the codebase works, in the exact order it runs during a single `POST /api/upload` request. Use this to explain the project in an interview.

---

## Entry Point — `src/server.ts`

**When:** Called once at startup (`npm run dev` or `node dist/server.js`).

**What it does:**
1. Loads `.env` via `dotenv/config`
2. Calls `pool.query('SELECT 1')` — if Neon is unreachable, the process exits immediately
3. Calls `startAliasListener()` — opens a persistent PostgreSQL LISTEN connection
4. Calls `app.listen(PORT)` — starts accepting HTTP requests

**Key decision:** The DB ping happens before the server opens its port. If the database is down, the server never starts — fail fast rather than accept requests that will all fail.

---

## Express App — `src/app.ts`

**Registered in order:**
1. `express.json()` — parses JSON bodies (for future endpoints)
2. `express.static('public')` — serves `public/index.html` at `GET /`
3. `GET /health` — returns `{ status: "ok" }` (used by Railway health checks)
4. `POST /api/upload` → `upload.route.ts`
5. 404 catch-all — any unknown route returns `{ error: "Route not found" }`

---

## Database Schema — `src/db/schema.ts`

```typescript
export const columnAliases = pgTable('column_aliases', {
  alias:          text('alias').primaryKey(),   // e.g. "Cust Name"
  canonicalField: text('canonical_field').notNull(), // e.g. "customer_name"
});
```

One table. `alias` is the primary key — prevents duplicate mappings.

This is the core of the dynamic header resolution. Instead of hardcoding `if header === "Cust Name"` in the code, the mapping lives in the database and can be extended without any code changes.

---

## Database Connection — `src/db/client.ts`

**Problem solved:** Neon connection strings include `?sslmode=require&channel_binding=require` as URL parameters. The `pg` library's own SSL parser reads these and prints a security warning to stderr even though SSL is configured correctly.

**Fix:**
```typescript
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.delete('sslmode');
dbUrl.searchParams.delete('channel_binding');

const pool = new Pool({
  connectionString: dbUrl.toString(),
  ssl: { rejectUnauthorized: true },  // SSL set explicitly here instead
});
```

Exports two things:
- `pool` — the raw `pg.Pool`, used in `server.ts` for the startup ping
- `db` — the Drizzle-wrapped instance, used everywhere else for queries

---

## Header Resolver — `src/modules/parser/header.resolver.ts`

### `startAliasListener()`

**Called once at startup.** Opens a dedicated `pg.Client` (NOT from the pool — LISTEN requires a persistent connection that isn't checked in/out).

```typescript
await client.connect();
await client.query('LISTEN aliases_changed');

client.on('notification', (msg) => {
  if (msg.channel === 'aliases_changed') {
    aliasCache = null;  // clear cache instantly
  }
});
```

A PostgreSQL trigger on `column_aliases` fires `pg_notify('aliases_changed')` on every INSERT/UPDATE/DELETE. This means:
- The cache lives forever during normal operation (zero DB queries)
- The moment you add a new alias, the server knows within milliseconds

If the LISTEN connection drops (Neon idle timeout), it reconnects after 5 seconds.

### `loadAliasMap()`

**Called on every upload request.**

```typescript
if (aliasCache) {
  return aliasCache;  // no DB query — instant
}

// Cache is null → fetch from Neon
const rows = await db.select().from(columnAliases);
const map = new Map<string, CanonicalField>();
for (const row of rows) {
  map.set(row.alias.toLowerCase().trim(), row.canonicalField);
}
aliasCache = map;
return map;
```

Keys are stored **lowercased and trimmed** so matching is case-insensitive. `"MOB NO"`, `"Mob No"`, `"mob no"` all resolve to `"phone"`.

### `resolveHeaders(rawHeaders, aliasMap)`

Takes the header row from the Excel file (e.g. `["Cust Name", "GST No", "Mob No"]`) and returns:
- `columnMap` — `Map<originalHeader, canonicalField>` for matched headers
- `unmapped` — headers with no match in the alias table
- `mappedFields` — `Set<CanonicalField>` of which canonical fields were found

---

## Excel Parser — `src/modules/parser/excel.parser.ts`

### `parseExcel(buffer, aliasMap)`

**Step 1 — Read:**
```typescript
const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
```
`cellDates: false` keeps dates as strings (e.g. `"15/01/2025"`) rather than JS Date objects, because we want to handle the parsing ourselves to support multiple formats.

**Step 2 — Convert to grid:**
```typescript
const grid = XLSX.utils.sheet_to_json(sheet, {
  header: 1,    // row 0 = headers array, not auto-generated keys
  defval: '',   // blank cells become "" not undefined
  raw: false,   // numbers and dates come as formatted strings
});
```

**Step 3 — Resolve headers:**  
Calls `resolveHeaders(grid[0], aliasMap)` — maps Excel column names to canonical field names.

**Step 4 — Build RawRow[]:**  
Iterates rows 1..N. For each non-empty row, builds a `RawRow` object using only the columns that resolved. Unmapped columns (e.g. `GST Number`) are silently ignored. Fully empty rows are skipped.

**RawRow shape:**
```typescript
interface RawRow {
  rowNumber: number;        // original Excel row number (for error reporting)
  customer_name?: string;   // raw string values, may be undefined if column missing
  phone?: string;
  last_purchase_date?: string;
  amount?: string;
  category?: string;
}
```

All values are strings at this stage — validation happens next.

---

## Row Validator — `src/modules/validator/row.validator.ts`

### `validateRows(rawRows)`

Iterates every `RawRow`. For each row, **all 5 fields are checked before any classification** — this is important. A row with 3 issues gets all 3 reported, not just the first.

#### Phone normalisation — `normalisePhone(raw)`

```typescript
function normalisePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s\-\(\)\+]/g, '');  // remove spaces, dashes, brackets, +

  // Only strip 91 prefix if the result is exactly 12 digits
  // (prevents "9134567890" — a valid number starting with 91 — from being stripped to 8 digits)
  const cleaned = stripped.length === 12 && stripped.startsWith('91')
    ? stripped.slice(2)
    : stripped;

  return /^\d{10}$/.test(cleaned) ? cleaned : null;
}
```

Handles: `+919810045231`, `+91 9810045231`, `91 9810045231`, `9810-04-5231`, `(981) 0045231`

#### Date parsing — `parseDate(raw)`

Tries formats in this order:
1. `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY` — regex match, manual Date construction
2. `YYYY-MM-DD` — ISO, direct `new Date()`
3. Excel serial number (e.g. `45657`) — days since 1899-12-30, in range 40000–60000

All output as `YYYY-MM-DD` ISO string.

#### Amount cleaning

```typescript
const num = Number(rawAmt.replace(/[₹,\s]/g, ''));  // strip ₹ symbol and commas
```

Accepts: `2450`, `2,450`, `1,23,456`, `₹2,450`, `₹ 2,450`, `2450.50`  
Rejects: `Rs. 2450`, `FREE`, `-500`, `0`

#### Classification

```typescript
if (issues.length === 0) {
  clean_rows.push({ rowNumber, customer_name, phone, last_purchase_date, amount, category });
} else {
  flagged_rows.push({ rowNumber, issues, raw: { ...originalValues } });
}
```

`CleanRow` — all values transformed (phone normalised, date as ISO, amount as number).  
`FlaggedRow` — original raw values preserved so the caller can show what was in the file.

---

## Upload Route — `src/modules/upload/upload.route.ts`

**Orchestrates the full pipeline.** This is the only file that knows about the request/response cycle.

### Multer configuration

```typescript
const upload = multer({
  storage: multer.memoryStorage(),        // file stays in RAM, never hits disk
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const valid = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(valid ? null : new Error('Only .xlsx, .xls, .csv accepted'), valid);
  },
});
```

### Early rejection

Before validating 10,000 rows, check if the file is even recognisable:

```typescript
const REQUIRED_FIELDS = new Set(['customer_name','phone','last_purchase_date','amount','category']);
const recognisedCount = [...mappedFields].filter(f => REQUIRED_FIELDS.has(f)).length;

if (recognisedCount === 0) {
  return res.status(400).json({ error: 'Unrecognisable file format...', unmapped_headers });
}
```

If none of the 5 expected columns were found, it means the file is a completely different kind of export (inventory, payroll, etc.) — reject immediately with HTTP 400 and list the columns that were found, so the user can add aliases.

### Pipeline order

```
Step 1  Request arrives     → Multer buffers file, validates extension + size
Step 2  Alias map loaded    → loadAliasMap() (cache hit or DB fetch)
Step 3  Excel parsed        → parseExcel() → RawRow[]
        Early reject?       → if no recognisable columns → HTTP 400
Step 4  Rows validated      → validateRows() → { clean_rows, flagged_rows }
Step 5  Summary logged      → counts, progress bars, issue breakdown
Step 6  JSON logged + sent  → full result object printed to terminal, then res.json()
```

---

## Types — `src/types/index.ts`

```typescript
type CanonicalField = 'customer_name' | 'phone' | 'last_purchase_date' | 'amount' | 'category';

interface RawRow {          // output of parseExcel() — all strings, nothing validated
  rowNumber: number;
  customer_name?: string;
  phone?: string;
  last_purchase_date?: string;
  amount?: string;
  category?: string;
}

interface CleanRow {        // output of validateRows() clean path — typed + normalised
  rowNumber: number;
  customer_name: string;
  phone: string;             // 10-digit normalised
  last_purchase_date: string;// YYYY-MM-DD
  amount: number;            // positive float
  category: string;
}

interface FlaggedRow {      // output of validateRows() flagged path
  rowNumber: number;
  issues: FieldIssue[];
  raw: Record<string, unknown>; // original cell values preserved
}

interface FieldIssue {
  field: CanonicalField;
  reason: string;            // human-readable description shown to user
}
```

---

## Logger — `src/utils/logger.ts`

Six labelled log functions + one section banner:

```typescript
logger.section('STEP 1 › FILE RECEIVED') // ━━━━ banner, no timestamp
logger.request(msg)   // [HH:MM:SS] [REQUEST]   ...
logger.db(msg)        // [HH:MM:SS] [DB]         ...
logger.parse(msg)     // [HH:MM:SS] [PARSE]      ...
logger.validate(msg)  // [HH:MM:SS] [VALIDATE]   ...
logger.result(msg)    // [HH:MM:SS] [RESULT]      ...
logger.error(msg)     // [HH:MM:SS] [ERROR]       ...  (stderr)
```

The label tells you exactly which module fired it — no guessing during an interview demo.

---

## Seed — `src/db/seed.ts`

Seeds 36 known aliases across 5 canonical fields:

| Canonical Field | Example Aliases |
|---|---|
| `customer_name` | Cust Name, Customer Name, Client Name, Party Name, Buyer, Name |
| `phone` | Mob No, Mobile No, Phone, Contact No, Cell |
| `last_purchase_date` | Inv Dt, Invoice Date, Purchase Date, Bill Date, Transaction Date |
| `amount` | Amt, Amount, Total, Bill Amount, Net Amount, Value |
| `category` | Item, Category, Product Name, Description, Particulars |

Uses `onConflictDoNothing()` — safe to re-run at any time.

---

## LISTEN/NOTIFY Trigger — `scripts/setup-notify-trigger.ts`

Run once after first deploy:

```sql
-- Function that fires the notification
CREATE OR REPLACE FUNCTION notify_aliases_changed()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('aliases_changed', '');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: fires after any write to column_aliases
CREATE TRIGGER aliases_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON column_aliases
FOR EACH STATEMENT EXECUTE FUNCTION notify_aliases_changed();
```
