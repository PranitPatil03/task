import 'dotenv/config';
import { db } from './client';
import { columnAliases } from './schema';

const ALIASES: { alias: string; canonicalField: string }[] = [
  { alias: 'Cust Name',     canonicalField: 'customer_name' },
  { alias: 'Customer Name', canonicalField: 'customer_name' },
  { alias: 'Name',          canonicalField: 'customer_name' },
  { alias: 'Client Name',   canonicalField: 'customer_name' },
  { alias: 'Party Name',    canonicalField: 'customer_name' },
  { alias: 'Buyer',         canonicalField: 'customer_name' },

  { alias: 'Mob No',        canonicalField: 'phone' },
  { alias: 'Mobile No',     canonicalField: 'phone' },
  { alias: 'Mobile',        canonicalField: 'phone' },
  { alias: 'Phone',         canonicalField: 'phone' },
  { alias: 'Phone No',      canonicalField: 'phone' },
  { alias: 'Contact',       canonicalField: 'phone' },
  { alias: 'Contact No',    canonicalField: 'phone' },
  { alias: 'Cell',          canonicalField: 'phone' },

  { alias: 'Inv Dt',            canonicalField: 'last_purchase_date' },
  { alias: 'Invoice Date',      canonicalField: 'last_purchase_date' },
  { alias: 'Date',              canonicalField: 'last_purchase_date' },
  { alias: 'Purchase Date',     canonicalField: 'last_purchase_date' },
  { alias: 'Bill Date',         canonicalField: 'last_purchase_date' },
  { alias: 'Transaction Date',  canonicalField: 'last_purchase_date' },
  { alias: 'Voucher Date',      canonicalField: 'last_purchase_date' },

  { alias: 'Amt',            canonicalField: 'amount' },
  { alias: 'Amount',         canonicalField: 'amount' },
  { alias: 'Total',          canonicalField: 'amount' },
  { alias: 'Total Amt',      canonicalField: 'amount' },
  { alias: 'Bill Amount',    canonicalField: 'amount' },
  { alias: 'Invoice Amount', canonicalField: 'amount' },
  { alias: 'Net Amount',     canonicalField: 'amount' },
  { alias: 'Value',          canonicalField: 'amount' },

  { alias: 'Item',          canonicalField: 'category' },
  { alias: 'Item Name',     canonicalField: 'category' },
  { alias: 'Category',      canonicalField: 'category' },
  { alias: 'Product',       canonicalField: 'category' },
  { alias: 'Product Name',  canonicalField: 'category' },
  { alias: 'Description',   canonicalField: 'category' },
  { alias: 'Particulars',   canonicalField: 'category' },
];

async function seed() {
  console.log(`Seeding ${ALIASES.length} column aliases...`);

  await db
    .insert(columnAliases)
    .values(ALIASES)
    .onConflictDoNothing();

  console.log('✓ Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
