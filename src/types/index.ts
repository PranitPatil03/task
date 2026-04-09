export type CanonicalField = 'customer_name' | 'phone' | 'last_purchase_date' | 'amount' | 'category';

export interface RawRow {
  rowNumber: number;
  customer_name?: string;
  phone?: string;
  last_purchase_date?: string;
  amount?: string;
  category?: string;
  [key: string]: unknown;
}

export interface CleanRow {
  rowNumber: number;
  customer_name: string;
  phone: string;
  last_purchase_date: string;
  amount: number;
  category: string;
}

export interface FlaggedRow {
  rowNumber: number;
  issues: FieldIssue[];
  raw: Record<string, unknown>;
}

export interface FieldIssue {
  field: CanonicalField | 'general';
  reason: string;
}

export interface ParseResult {
  clean_rows: CleanRow[];
  flagged_rows: FlaggedRow[];
  total_rows: number;
  unmapped_headers: string[];
}
