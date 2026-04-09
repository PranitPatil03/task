import { pgTable, text } from 'drizzle-orm/pg-core';

/**
 
 * Examples:
 *   alias            | canonical_field
 *   -----------------|----------------
 *   "Cust Name"      | customer_name
 *   "Mob No"         | phone
 *   "Inv Dt"         | last_purchase_date
 *   "Amt"            | amount
 *   "Item"           | category
 */

export const columnAliases = pgTable('column_aliases', {
  alias: text('alias').primaryKey(),

  canonicalField: text('canonical_field').notNull(),
});