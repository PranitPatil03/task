import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(__dirname, '..', 'data', 'tests');
fs.mkdirSync(OUT_DIR, { recursive: true });

function write(filename: string, rows: unknown[][], sheetName = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filepath = path.join(OUT_DIR, filename);
  XLSX.writeFile(wb, filepath);
  const size = fs.statSync(filepath).size;
  console.log(`  ✓  ${filename.padEnd(40)} ${(size / 1024).toFixed(1).padStart(8)} KB  |  ${rows.length - 1} data rows`);
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const FIRST = ['Ramesh','Sunita','Vikram','Priya','Deepak','Anjali','Mohit','Kavita','Suresh','Neha',
                'Arjun','Pooja','Ravi','Meena','Arun','Divya','Kiran','Sonia','Nitin','Reema',
                'Sachin','Nisha','Manish','Puja','Rajesh','Lata','Amitabh','Geeta','Rohit','Smita'];
const LAST  = ['Gupta','Sharma','Malhotra','Nair','Verma','Singh','Agarwal','Joshi','Patel','Kapoor',
                'Mehta','Shah','Bose','Rao','Reddy','Kumar','Mishra','Pandey','Iyer','Pillai'];
const ITEMS = ['Ethnic Wear','Saree','Sherwani','Dress Material','Kids Wear','Lehenga','Kurta Pyjama',
                'Salwar Suit','Dupatta','Blazer','Jacket','Blouse','Churidar','Anarkali','Bandhgala'];

function name(): string { return `${rand(FIRST)} ${rand(LAST)}`; }
function phone(): string { return `9${randInt(100000000, 999999999)}`; }
function amount(): number { return randInt(200, 15000); }
function category(): string { return rand(ITEMS); }
function dateStr(fmt: 'dmy_slash' | 'dmy_dash' | 'dmy_dot' | 'iso' = 'dmy_slash'): string {
  const y = randInt(2023, 2025);
  const m = randInt(1, 12);
  const d = randInt(1, 28);
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  if (fmt === 'dmy_slash') return `${dd}/${mm}/${y}`;
  if (fmt === 'dmy_dash')  return `${dd}-${mm}-${y}`;
  if (fmt === 'dmy_dot')   return `${dd}.${mm}.${y}`;
  return `${y}-${mm}-${dd}`;
}

console.log('\nGenerating test files...\n');

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];
  for (let i = 0; i < 50; i++) {
    rows.push([name(), phone(), dateStr('dmy_slash'), amount(), category()]);
  }
  write('all-clean-standard.xlsx', rows);
}

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];
  const scenarios = [
    ['', '9810045231', '15/01/2025', 2450, 'Ethnic Wear'],            // missing name
    ['Ramesh Gupta', '', '15/01/2025', 2450, 'Ethnic Wear'],          // missing phone
    ['Ramesh Gupta', '9810045231', '', 2450, 'Ethnic Wear'],          // missing date
    ['Ramesh Gupta', '9810045231', '15/01/2025', '', 'Ethnic Wear'],  // missing amount
    ['Ramesh Gupta', '9810045231', '15/01/2025', 2450, ''],           // missing category
    ['Sunita Sharma', '12345', '22/01/2025', 1800, 'Saree'],          // phone too short (5 digits)
    ['Vikram Malhotra', '98765432100', '03/02/2025', 5200, 'Sherwani'], // phone too long (11 digits)
    ['Priya Nair', '9845678901', '32/01/2025', 3100, 'Dress Material'], // invalid day 32
    ['Deepak Verma', '9711234456', '01/13/2025', 780, 'Kids Wear'],   // invalid month 13
    ['Anjali Singh', '9958712345', 'Jan 18 2025', 4600, 'Lehenga'],   // unparseable date format
    ['Mohit Agarwal', '9312345678', '25/03/2025', -500, 'Kurta'],     // negative amount
    ['Kavita Joshi', '9876543210', '02/04/2025', 0, 'Saree'],         // zero amount
    ['Suresh Patel', '9654321098', '10/04/2025', 'FREE', 'Ethnic'],   // non-numeric amount
    ['', '', '', '', ''],                                              // all missing
    ['Neha Kapoor', '98765 43210', 'not-a-date', '₹abc', ''],         // multiple issues
  ];
  for (let i = 0; i < 30; i++) {
    rows.push(scenarios[i % scenarios.length]!);
  }
  write('all-flagged.xlsx', rows);
}

{
  const HEADER_SETS = [
    ['Customer Name', 'Mobile No',   'Invoice Date',     'Amount',     'Category'],
    ['Name',          'Phone',        'Purchase Date',    'Total Amt',  'Product Name'],
    ['Client Name',   'Contact No',   'Bill Date',        'Net Amount', 'Description'],
    ['Party Name',    'Mobile',       'Transaction Date', 'Value',      'Particulars'],
    ['Buyer',         'Cell',         'Voucher Date',     'Bill Amount','Item Name'],
  ];
  const headers = rand(HEADER_SETS);
  const rows: unknown[][] = [headers];
  for (let i = 0; i < 40; i++) {
    rows.push([name(), phone(), dateStr('dmy_slash'), amount(), category()]);
  }
  write('alias-header-variants.xlsx', rows);
}

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];
  const dirtyPhones = [
    '+919810045231',       // +91 prefix
    '+91 9810045231',      // +91 with space
    '91 9810045231',       // 91 prefix with space
    '919810045231',        // 91 prefix no space
    '98100-45231',         // dash in middle
    '9810 045231',         // space in middle
    '(981) 0045231',       // brackets
    '+91-981-0045231',     // +91 with dashes
    '  9810045231  ',      // leading/trailing spaces
    '98 10 04 52 31',      // spaces every 2 digits
  ];
  dirtyPhones.forEach((ph, i) => {
    rows.push([name(), ph, dateStr(), amount(), category()]);
  });
  // add some that should FAIL
  rows.push([name(), '12345',      dateStr(), amount(), category()]); // too short
  rows.push([name(), '00000000000',dateStr(), amount(), category()]); // all zeros (11 digits)
  rows.push([name(), 'NINE EIGHT', dateStr(), amount(), category()]); // text
  write('dirty-phones.xlsx', rows);
}

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];
  const dates = [
    '15/01/2025',   // DD/MM/YYYY — standard
    '05/03/2025',   // DD/MM/YYYY — single-digit day
    '3/2/2025',     // D/M/YYYY   — no padding
    '15-01-2025',   // DD-MM-YYYY — dashes
    '15.01.2025',   // DD.MM.YYYY — dots
    '2025-01-15',   // YYYY-MM-DD — ISO
    '2025-1-5',     // YYYY-M-D   — no padding
    '45657',        // Excel serial (2025-01-15)
    '01/01/2023',   // old date — valid
    '31/12/2025',   // end of year
    '29/02/2024',   // leap day 2024 — valid
    '29/02/2025',   // leap day 2025 — INVALID (2025 not leap)
    '00/01/2025',   // day zero — INVALID
    '15/00/2025',   // month zero — INVALID
    'not a date',   // completely invalid
    '2025/15/01',   // wrong order (YYYY/DD/MM) — likely to fail
  ];
  dates.forEach((dt) => {
    rows.push([name(), phone(), dt, amount(), category()]);
  });
  write('date-format-variants.xlsx', rows);
}

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];
  const amounts = [
    '2450',           // plain number — clean
    '2,450',          // comma separator — should clean
    '1,23,456',       // Indian lakh format — should clean
    '₹2,450',         // rupee symbol — should clean
    '₹ 2,450',        // rupee + space — should clean
    'Rs. 2450',       // Rs. prefix — will FAIL (not handled)
    'INR 2450',       // INR prefix — will FAIL
    '2450.00',        // decimal — should clean
    '2450.50',        // fractional — should clean
    '-500',           // negative — should FAIL
    '0',              // zero — should FAIL
    '',               // empty — should FAIL
    'FREE',           // text — should FAIL
    '2450 /-',        // common Indian style — will FAIL
    '1,00,00,000',    // crore — valid number
  ];
  amounts.forEach((amt) => {
    rows.push([name(), phone(), dateStr(), amt, category()]);
  });
  write('dirty-amounts.xlsx', rows);
}

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];
  rows.push([name(),   phone(),    dateStr(),    amount(),  category()]); // all clean
  rows.push(['',       '',         '',           '',        '']);          // 5 issues
  rows.push([name(),   '12345',    'bad-date',   '-100',    '']);          // 4 issues
  rows.push(['',       '12345',    '15/01/2025', amount(),  category()]); // 2 issues
  rows.push([name(),   '',         '',           amount(),  '']);          // 3 issues
  rows.push([name(),   phone(),    'bad-date',   'FREE',    category()]); // 2 issues
  rows.push([name(),   '00000000', 'bad-date',   '',        '']);          // 4 issues
  rows.push(['',       phone(),    dateStr(),    0,         category()]); // 2 issues (name + amount)
  rows.push([name(),   phone(),    dateStr(),    amount(),  category()]); // all clean
  rows.push([name(),   phone(),    dateStr(),    amount(),  category()]); // all clean
  write('multiple-issues-per-row.xlsx', rows);
}

{
  const rows: unknown[][] = [[
    'Cust Name', 'GST Number', 'Mob No', 'Address', 'Inv Dt', 'Amt', 'Item', 'Salesperson'
  ]];
  for (let i = 0; i < 30; i++) {
    rows.push([
      name(),
      `27AABCU${randInt(1000,9999)}B1Z5`,  // fake GST
      phone(),
      `${randInt(1,999)} MG Road, ${rand(['Mumbai','Delhi','Pune','Bangalore'])}`,
      dateStr(),
      amount(),
      category(),
      rand(['Ravi', 'Anita', 'Sunil', 'Meera']),
    ]);
  }
  write('extra-unmapped-columns.xlsx', rows);
}

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];

  // Very long customer name
  rows.push(['Shri Raghunathprasad Venkatasubramaniam Iyer Jr.', phone(), dateStr(), amount(), category()]);

  // Name with special characters
  rows.push(["D'souza & Sons (Pvt. Ltd.)", phone(), dateStr(), amount(), category()]);
  rows.push(['Müller / Schäfer', phone(), dateStr(), amount(), category()]);

  // Phone starting with 0 (landline style — 10 digits after stripping but starts with 0)
  rows.push([name(), '0981004523', dateStr(), amount(), category()]);

  // Amount with just decimal
  rows.push([name(), phone(), dateStr(), '.50', category()]);

  // Amount as a very large number
  rows.push([name(), phone(), dateStr(), 9999999, category()]);

  // Date at epoch boundary
  rows.push([name(), phone(), '01/01/2000', amount(), category()]);

  // Future date — should still be valid (we don't reject future dates)
  rows.push([name(), phone(), '01/01/2030', amount(), category()]);

  // Category with numbers
  rows.push([name(), phone(), dateStr(), amount(), 'Size 42 Trousers']);

  // Empty rows in middle (should be skipped)
  rows.push(['', '', '', '', '']);
  rows.push(['', '', '', '', '']);
  rows.push([name(), phone(), dateStr(), amount(), category()]);

  // Whitespace-only fields (should count as missing)
  rows.push(['   ', '  ', '  ', '  ', '  ']);

  // Unicode category
  rows.push([name(), phone(), dateStr(), amount(), 'शेरवानी']);

  // Duplicate rows (both should appear in clean)
  const dupRow = [name(), phone(), dateStr(), amount(), category()];
  rows.push(dupRow);
  rows.push(dupRow);

  write('edge-cases.xlsx', rows);
}

{
  const rows: unknown[][] = [['Cust Name','Mob No','Inv Dt','Amt','Item']];
  const DATE_FORMATS: Array<'dmy_slash'|'dmy_dash'|'dmy_dot'|'iso'> = ['dmy_slash','dmy_dash','dmy_dot','iso'];
  const DIRTY_PHONES = ['+91', '91', '+91 '];

  for (let i = 0; i < 30_000; i++) {
    const isFlagged = i % 5 === 0;

    if (!isFlagged) {
      // Clean row — randomise date and phone format slightly
      const fmt = DATE_FORMATS[i % 4]!;
      const ph  = i % 7 === 0
        ? `${DIRTY_PHONES[i % 3]}${phone()}`  // +91 prefix (normalised by validator)
        : phone();
      rows.push([name(), ph, dateStr(fmt), amount(), category()]);
    } else {
      // Flagged row — rotate through issue types
      const issueType = (i / 5) % 4;
      switch (issueType) {
        case 0: rows.push([name(), '',      dateStr(), amount(),  category()]); break; // missing phone
        case 1: rows.push([name(), phone(), '',        amount(),  category()]); break; // missing date
        case 2: rows.push([name(), phone(), dateStr(), 0,         category()]); break; // zero amount
        case 3: rows.push([name(), phone(), dateStr(), amount(),  '']);         break; // missing category
      }
    }
  }
  write('large-30k-rows.xlsx', rows);
}

console.log('\nAll test files written to data/tests/\n');
