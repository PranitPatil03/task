import * as XLSX from 'xlsx';
import { resolveHeaders } from './header';
import { CanonicalField, RawRow } from '../../types';
import { logger } from '../../utils/logger';

export function parseExcel(
  buffer: Buffer,
  aliasMap: Map<string, CanonicalField>
): {
  rawRows: RawRow[];
  unmappedHeaders: string[];
  mappedFields: Set<CanonicalField>;
} {

  logger.parse('  ├─ 3.1  Read file   → SheetJS parsing buffer...');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel file contains no sheets');

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,   
    defval: '',  
    raw: false, 
  });

  const dataRows = grid.length > 0 ? grid.length - 1 : 0;


  logger.parse(`  │   Sheet         : "${sheetName}"`);
  logger.parse(`  │   Total sheets  : ${workbook.SheetNames.length}  (using first)`);
  logger.parse(`  │   Rows found    : ${grid.length} total  →  1 header + ${dataRows} data rows`);

  if (grid.length < 2) {
    logger.parse('  │   Sheet has no data rows — returning empty result');
    return { rawRows: [], unmappedHeaders: [], mappedFields: new Set() };
  }

  const headers = (grid[0] as string[]).map((h) => String(h ?? '').trim());
  const { columnMap, unmapped, mappedFields } = resolveHeaders(headers, aliasMap);

  logger.parse(`  │`);
  logger.parse(`  ├─ 3.2  Map headers → lookup each Excel column in column_aliases table`);
  logger.parse(`  │   ┌─────────────────────────┬──────────────────────────────┐`);
  logger.parse(`  │   │ Excel Column Header      │ Canonical Field (DB key)     │`);
  logger.parse(`  │   ├─────────────────────────┼──────────────────────────────┤`);


  for (const header of headers) {
    const canonical = columnMap.get(header);
    const left  = header.padEnd(23);
    if (canonical) {
      logger.parse(`  │   │ ${left} │ ${canonical.padEnd(27)}  ✓ │`);
    } else {
      logger.parse(`  │   │ ${left} │ ${'(no match — ignored)'.padEnd(27)}  ✗ │`);
    }
  }


  logger.parse(`  │   └─────────────────────────┴──────────────────────────────┘`);
  logger.parse(`  │   Result: ${columnMap.size} mapped  |  ${unmapped.length} unmapped`);
  logger.parse(`  │`);
  logger.parse(`  └─ 3.3  Extract rows → build structured rows from mapped columns`);

  const rawRows: RawRow[] = [];
  let skippedEmpty = 0;

  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i] as unknown[];

    const isEmpty = cells.every((c) => c === '' || c == null);
    if (isEmpty) { skippedEmpty++; continue; }

    const row: RawRow = { rowNumber: i + 1 };
    headers.forEach((header, colIndex) => {
      const canonicalField = columnMap.get(header);
      if (!canonicalField) return;
      const value = String(cells[colIndex] ?? '').trim();
      row[canonicalField] = value || undefined;
    });

    const name  = (row.customer_name      ?? '—').toString().padEnd(22);
    const phone = (row.phone              ?? '—').toString().padEnd(12);
    const date  = (row.last_purchase_date ?? '—').toString().padEnd(12);
    const amt   = (row.amount             ?? '—').toString().padEnd(8);
    const cat   = (row.category           ?? '—').toString();
    logger.parse(`       Row ${String(row.rowNumber).padEnd(3)} │ ${name} │ ${phone} │ ${date} │ ${amt} │ ${cat}`);

    rawRows.push(row);
  }

  if (skippedEmpty > 0) {
    logger.parse(`       (${skippedEmpty} fully-empty row(s) skipped)`);
  }
  logger.parse(`       Total extracted: ${rawRows.length} data rows`);

  return { rawRows, unmappedHeaders: unmapped, mappedFields };
}
