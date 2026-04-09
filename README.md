# Billing Data Cleaner

A Node.js REST API that accepts messy Excel/CSV billing exports (from Busy, Tally, or any accounting software), resolves inconsistent column headers via a PostgreSQL alias table, validates every row, and returns clean and flagged records as structured JSON.

---

## How It Works
```
POST /api/upload  (multipart/form-data, field: "file")
         │
         ▼
  ┌─────────────────┐
  │  Multer          │  holds file in memory (no disk write), rejects > 10MB
  └────────┬────────┘
           │ Buffer
           ▼
  ┌─────────────────┐
  │  loadAliasMap() │  fetches column_aliases from Neon (cached forever,
  └────────┬────────┘  auto-cleared via PostgreSQL LISTEN/NOTIFY on change)
           │ Map<string, CanonicalField>
           ▼
  ┌─────────────────┐
  │  parseExcel()   │  SheetJS → 2D grid → resolveHeaders() → RawRow[]
  └────────┬────────┘
           │ RawRow[]
           ▼
  ┌─────────────────┐
  │  validateRows() │  checks all 5 fields per row, collects ALL issues
  └────┬───────┬────┘  before classifying (not first-fail)
       │       │
   CLEAN    FLAGGED
       │       │
       └───┬───┘
           ▼
     JSON Response
  { clean_rows, flagged_rows, total_rows, unmapped_headers }
```

![How it works](public/working.png)

---

## Project Structure

```
data-clean/
├── src/
│   ├── server.ts                      # Entry — DB ping, startAliasListener(), app.listen()
│   ├── app.ts                         # Express — registers routes + static UI
│   ├── types/index.ts                 # CanonicalField, RawRow, CleanRow, FlaggedRow, ParseResult
│   ├── db/
│   │   ├── schema.ts                  # Drizzle table: column_aliases (alias PK, canonical_field)
│   │   ├── client.ts                  # pg.Pool + Drizzle instance (strips sslmode from URL)
│   │   └── seed.ts                    # Seeds 36 known header aliases
│   └── modules/
│       ├── parser/
│       │   ├── header.resolver.ts     # loadAliasMap() with LISTEN/NOTIFY cache, resolveHeaders()
│       │   └── excel.parser.ts        # parseExcel() — SheetJS → RawRow[]
│       ├── validator/
│       │   └── row.validator.ts       # validateRows() — normalisePhone(), parseDate()
│       └── upload/
│           └── upload.route.ts        # POST /api/upload — orchestrates the full pipeline
├── scripts/
│   └── setup-notify-trigger.ts        # Creates PostgreSQL trigger for LISTEN/NOTIFY
├── data/
│   ├── billing.xlsx                   # Sample 10-row file
│   └── tests/                         # 10 test files (edge cases, dirty data, 30k rows)
├── public/index.html                  # Drag-and-drop upload UI (served at /)
├── Dockerfile                         # Multi-stage build (builder + runner)
├── .dockerignore
├── .env.example
├── drizzle.config.ts
└── tsconfig.json
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 20 + TypeScript | Type safety throughout |
| Web framework | Express 5 | Minimal, battle-tested |
| File upload | Multer (memoryStorage) | No disk writes — file stays as Buffer |
| Excel parsing | SheetJS (xlsx) | Handles `.xlsx`, `.xls`, `.csv` |
| Database | Neon (serverless Postgres) | Free tier, cloud-hosted, no local setup |
| ORM | Drizzle ORM | Type-safe queries, zero runtime overhead |
| Cache invalidation | PostgreSQL LISTEN/NOTIFY | Cache clears instantly when alias table changes |
| Deployment | Docker → Railway | Single Dockerfile, auto-deploy on push |

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/PranitPatil03/task.git
cd task
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### 3. Set up the database

```bash
npm run db:push          # creates column_aliases table in Neon
npm run db:seed          # inserts 36 known header aliases
npm run db:setup-notify  # creates the PostgreSQL trigger for cache invalidation
```

### 4. Start the dev server

```bash
npm run dev
```

Server starts at `http://localhost:3000`. Open it in a browser for the upload UI.

### 5. Test with curl

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@data/billing.xlsx" | jq
```

---

## API Reference

### `POST /api/upload`

Upload a billing export file for cleaning.

**Request**
- `Content-Type: multipart/form-data`
- Field name: `file`
- Accepted: `.xlsx`, `.xls`, `.csv`
- Max size: 10 MB

**Response**

```json
{
  "total_rows": 10,
  "unmapped_headers": [],
  "clean_rows": [
    {
      "rowNumber": 2,
      "customer_name": "Ramesh Gupta",
      "phone": "9810045231",
      "last_purchase_date": "2025-01-15",
      "amount": 2450,
      "category": "Ethnic Wear"
    }
  ],
  "flagged_rows": [
    {
      "rowNumber": 9,
      "issues": [
        { "field": "phone", "reason": "Missing phone number" }
      ],
      "raw": {
        "customer_name": "Kavita Joshi",
        "last_purchase_date": "02/04/2025",
        "amount": "2900",
        "category": "Saree"
      }
    }
  ]
}
```

## Adding a New Column Header Variant

No code changes needed. Just insert a row:

```sql
INSERT INTO column_aliases (alias, canonical_field)
VALUES ('Client No.', 'phone')
ON CONFLICT DO NOTHING;
```

The PostgreSQL trigger fires `pg_notify('aliases_changed')` → the running server clears its alias cache → the new alias is active on the next upload (within milliseconds).