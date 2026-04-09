/**
 * upload.route.ts
 *
 * Handles POST /api/upload
 *
 * Flow:
 *  1. Multer receives the file and keeps it in memory (no disk writes)
 *  2. Load alias map from Neon DB (served from cache after first request)
 *  3. Parse the Excel buffer → raw rows with canonical keys
 *  4. Early reject if none of the 5 required columns are recognisable
 *  5. Validate each row → split into clean_rows and flagged_rows
 *  6. Return JSON
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { loadAliasMap } from '../parser/header';
import { parseExcel } from '../parser/excel';
import { validateRows } from '../validator/row';
import { CanonicalField, ParseResult } from '../../types';
import { logger } from '../../utils/logger';

const router = Router();

const REQUIRED_FIELDS = new Set<CanonicalField>(['customer_name', 'phone', 'last_purchase_date', 'amount', 'category']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const validExtension = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (validExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are accepted'));
    }
  },
});

const multerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum allowed size is 10 MB.' });
      } else {
        res.status(400).json({ error: err.message });
      }
      return;
    }
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'File upload error' });
      return;
    }
    next();
  });
};

router.post('/', multerMiddleware, async (req: Request, res: Response): Promise<void> => {

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Send the file using field name "file".' });
    return;
  }

  logger.section('STEP 1 › FILE RECEIVED');
  const kb  = (req.file.size / 1024).toFixed(1);
  const ext = req.file.originalname.split('.').pop()?.toUpperCase() ?? 'UNKNOWN';
  logger.request(`  ├─ Name     : ${req.file.originalname}`);
  logger.request(`  ├─ Size     : ${req.file.size.toLocaleString()} bytes  (${kb} KB)`);
  logger.request(`  ├─ Format   : ${ext} file`);
  logger.request(`  └─ Storage  : held in memory buffer (no disk write)`);

  try {
    logger.section('STEP 2 › ALIAS MAP  (maps Excel column names → canonical field names)');
    const aliasMap = await loadAliasMap();

    logger.section('STEP 3 › EXCEL PARSING');
    const { rawRows, unmappedHeaders, mappedFields } = parseExcel(req.file.buffer, aliasMap);

    if (unmappedHeaders.length > 0) {
      logger.parse(`  ⚠  Unmapped headers (no alias in DB): [${unmappedHeaders.join(', ')}]`);
    }

    const recognisedCount = [...mappedFields].filter(f => REQUIRED_FIELDS.has(f)).length;
    if (recognisedCount === 0) {
      const hint = unmappedHeaders.length > 0
        ? `Found columns: [${unmappedHeaders.join(', ')}]. None matched any known alias.`
        : 'File appears to have no column headers.';

      logger.error(`Rejected — no recognisable columns. ${hint}`);
      res.status(400).json({
        error: 'Unrecognisable file format. Please upload a valid billing export.',
        detail: `${hint} Add the correct header alias to the column_aliases table and re-upload.`,
        unmapped_headers: unmappedHeaders,
      });
      return;
    }

    const missingFields = [...REQUIRED_FIELDS].filter(f => !mappedFields.has(f));
    if (missingFields.length > 0) {
      logger.parse(`  ⚠  Required column(s) missing from file: [${missingFields.join(', ')}]`);
      logger.parse(`     All rows will be flagged for these fields`);
    }

    logger.section(`STEP 4 › ROW VALIDATION  (checking all 5 fields on each of ${rawRows.length} rows)`);
    const { clean_rows, flagged_rows } = validateRows(rawRows);

    logger.section('STEP 5 › FINAL SUMMARY');
    const cleanPct = rawRows.length > 0 ? Math.round((clean_rows.length  / rawRows.length) * 100) : 0;
    const flagPct  = rawRows.length > 0 ? Math.round((flagged_rows.length / rawRows.length) * 100) : 0;

    const bar = (pct: number, fill: string, empty: string, len = 20) =>
      fill.repeat(Math.round(pct / 100 * len)) + empty.repeat(len - Math.round(pct / 100 * len));

    logger.result(`  Total rows processed : ${rawRows.length}`);
    logger.result(`  ├─ Clean   : ${String(clean_rows.length).padStart(4)}  ✓  [${bar(cleanPct, '█', '░')}]  ${cleanPct}%`);
    logger.result(`  └─ Flagged : ${String(flagged_rows.length).padStart(4)}  ✗  [${bar(flagPct, '█', '░')}]  ${flagPct}%`);

    if (flagged_rows.length > 0) {
      const flaggedNums = flagged_rows.map(r => `Row ${r.rowNumber}`).join(', ');
      logger.result(`  Flagged rows         : ${flaggedNums}`);

      const issueCounts = new Map<string, number>();
      flagged_rows.forEach(r => r.issues.forEach(i => {
        issueCounts.set(i.field, (issueCounts.get(i.field) ?? 0) + 1);
      }));
      const totalIssues = [...issueCounts.values()].reduce((a, b) => a + b, 0);
      logger.result(`  Issue breakdown      : ${totalIssues} total issues`);
      const issueEntries = [...issueCounts.entries()];
      issueEntries.forEach(([field, count], idx) => {
        const prefix = idx === issueEntries.length - 1 ? '└─' : '├─';
        logger.result(`    ${prefix} ${field.padEnd(22)} : ${count} row${count > 1 ? 's' : ''}`);
      });
    }

    if (unmappedHeaders.length > 0) {
      logger.result(`  Ignored columns      : [${unmappedHeaders.join(', ')}]  (no alias in DB)`);
    }

    console.log('');

    const result: ParseResult = {
      clean_rows,
      flagged_rows,
      total_rows: rawRows.length,
      unmapped_headers: unmappedHeaders,
    };

    logger.section('STEP 6 › JSON RESPONSE  (sent back to client)');
    console.log(JSON.stringify(result, null, 2)
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n'));
    console.log('');

    res.json(result);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    logger.error(`Request failed — ${message}`);
    res.status(500).json({ error: message });
  }
});

export default router;
