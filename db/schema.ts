import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Only token hashes, invitation metadata and ciphertext, never plaintext lists.
export const shares = sqliteTable('shares', {
  id: text('id').primaryKey(),
  revision: text('revision').notNull(),
  document: text('document').notNull()
});
