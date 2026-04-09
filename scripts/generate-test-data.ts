import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const rows = [
  // Clean rows
  ['Cust Name',    'Mob No',     'Inv Dt',     'Amt',  'Item'],
  ['Ramesh Gupta', '9810045231', '15/01/2025', 2450,   'Ethnic Wear'],
  ['Sunita Sharma','9871234567', '22/01/2025', 1800,   'Saree'],
  ['Vikram Malhotra','9899001122','03/02/2025', 5200,   'Sherwani'],
  ['Priya Nair',   '9845678901', '14/02/2025', 3100,   'Dress Material'],
  ['Deepak Verma', '9711234456', '01/03/2025', 780,    'Kids Wear'],
  ['Anjali Singh', '9958712345', '18/03/2025', 4600,   'Lehenga'],
  ['Mohit Agarwal','9312345678', '25/03/2025', 1250,   'Kurta Pyjama'],
  // Flagged rows (matching screenshot red rows)
  ['Kavita Joshi', '',           '02/04/2025', 2900,   'Saree'],        // missing phone
  ['Suresh Patel', '9876543210', '',           1500,   'Ethnic Wear'],  // missing date
  ['Neha Kapoor',  '9654321098', '10/04/2025', '',     ''],             // missing amount + category
];

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Billing');

const outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'test-billing.xlsx');
XLSX.writeFile(wb, outPath);

console.log(`✓ Test file written to: ${outPath}`);
