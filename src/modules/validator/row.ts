import { CleanRow, FlaggedRow, FieldIssue, RawRow } from '../../types';
import { logger } from '../../utils/logger';

function parseDate(raw: string): Date | null {
  if (!raw) return null;

  // DD/MM/YYYY  or  DD-MM-YYYY  or  DD.MM.YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const day   = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year  = parseInt(y, 10);
    const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month || dt.getDate() !== day) return null;
    return dt;
  }

  // YYYY-MM-DD (already ISO)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year  = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day   = parseInt(d, 10);
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month || dt.getDate() !== day) return null;
    return dt;
  }

  // Excel serial number (e.g. 45123) — days since 1900-01-00
  const serial = Number(raw);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const dt = new Date(new Date(1899, 11, 30).getTime() + serial * 86_400_000);
    if (!isNaN(dt.getTime())) return dt;
  }

  return null;
}

function normalisePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s\-\(\)\+]/g, '');
  const cleaned = stripped.length === 12 && stripped.startsWith('91')
    ? stripped.slice(2)
    : stripped;
  return /^\d{10}$/.test(cleaned) ? cleaned : null;
}

export function validateRows(rawRows: RawRow[]): {
  clean_rows: CleanRow[];
  flagged_rows: FlaggedRow[];
} {
  const clean_rows: CleanRow[] = [];
  const flagged_rows: FlaggedRow[] = [];

  for (const row of rawRows) {
    const issues: FieldIssue[] = [];

    const customer_name = String(row.customer_name ?? '').trim();
    const nameOk = !!customer_name;
    if (!nameOk) issues.push({ field: 'customer_name', reason: 'Missing customer name' });

    const rawPhone = String(row.phone ?? '').trim();
    const phone    = rawPhone ? normalisePhone(rawPhone) : null;
    const phoneOk  = !!phone;
    if (!rawPhone)    issues.push({ field: 'phone', reason: 'Missing phone number' });
    else if (!phone)  issues.push({ field: 'phone', reason: `"${rawPhone}" is not a valid 10-digit number` });

    const rawDate          = String(row.last_purchase_date ?? '').trim();
    const parsedDate       = rawDate ? parseDate(rawDate) : null;
    const last_purchase_date = parsedDate ? parsedDate.toISOString().split('T')[0] : null;
    const dateOk           = !!last_purchase_date;
    if (!rawDate)         issues.push({ field: 'last_purchase_date', reason: 'Missing purchase date' });
    else if (!parsedDate) issues.push({ field: 'last_purchase_date', reason: `"${rawDate}" is not a recognised date — use DD/MM/YYYY` });

    const rawAmt  = String(row.amount ?? '').trim();
    const num     = rawAmt ? Number(rawAmt.replace(/[₹,\s]/g, '')) : NaN;
    const amount  = (!isNaN(num) && num > 0) ? num : null;
    const amtOk   = amount !== null;
    if (!rawAmt)           issues.push({ field: 'amount', reason: 'Missing amount' });
    else if (amount === null) issues.push({ field: 'amount', reason: `"${rawAmt}" is not a valid positive amount` });

    const category = String(row.category ?? '').trim();
    const catOk    = !!category;
    if (!catOk) issues.push({ field: 'category', reason: 'Missing category / item name' });

    const status = issues.length === 0 ? 'CLEAN ✓' : `FLAGGED ✗  (${issues.length} issue${issues.length > 1 ? 's' : ''})`;
    logger.validate(`  ┌─ Row ${row.rowNumber} — ${status}`);
    logger.validate(`  │  name   ${nameOk ? '✓' : '✗'}  ${nameOk  ? customer_name              : 'MISSING'}`);
    logger.validate(`  │  phone  ${phoneOk ? '✓' : '✗'}  ${rawPhone ? (phoneOk ? `${rawPhone} → ${phone}` : `${rawPhone}  ← INVALID`) : 'MISSING'}`);
    logger.validate(`  │  date   ${dateOk ? '✓' : '✗'}  ${rawDate  ? (dateOk  ? `${rawDate} → ${last_purchase_date}` : `${rawDate}  ← INVALID`) : 'MISSING'}`);
    logger.validate(`  │  amount ${amtOk  ? '✓' : '✗'}  ${rawAmt   ? (amtOk   ? `${rawAmt} → ${amount}` : `${rawAmt}  ← INVALID`) : 'MISSING'}`);
    logger.validate(`  │  cat    ${catOk  ? '✓' : '✗'}  ${catOk   ? category                   : 'MISSING'}`);

    if (issues.length === 0) {
      logger.validate(`  └─────────────────────────────────────`);
      clean_rows.push({
        rowNumber: row.rowNumber,
        customer_name,
        phone: phone!,
        last_purchase_date: last_purchase_date!,
        amount: amount!,
        category,
      });
    } else {
      issues.forEach((issue, idx) => {
        const prefix = idx === issues.length - 1 ? '  └──' : '  ├──';
        logger.validate(`${prefix} Issue: ${issue.field} — ${issue.reason}`);
      });
      flagged_rows.push({
        rowNumber: row.rowNumber,
        issues,
        raw: {
          customer_name: row.customer_name,
          phone: row.phone,
          last_purchase_date: row.last_purchase_date,
          amount: row.amount,
          category: row.category,
        },
      });
    }
  }

  logger.validate('');
  logger.validate(`  Validation complete — ${clean_rows.length} clean ✓   ${flagged_rows.length} flagged ✗`);

  return { clean_rows, flagged_rows };
}
