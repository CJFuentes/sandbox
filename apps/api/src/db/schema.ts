// Drizzle table definitions. After changing this file, run `pnpm db:generate` to write a migration
// to apps/api/drizzle, then `pnpm db:migrate` to apply it.
import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stored trimmed and lower-cased, so the unique constraint is case-insensitive. */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Trimmed, 1-120 characters. */
    title: text('title').notNull(),
    /** Stored verbatim (never trimmed), 0-20000 characters. */
    body: text('body').notNull().default(''),
    /** Normalised (trimmed, lower-cased), de-duplicated and sorted ascending; at most 10. */
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    /** Millisecond precision (precision: 3) so the stored sort key equals the toISOString() value the API returns. */
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date', precision: 3 }).notNull().defaultNow(),
    /** Changes only when a stored value (title, body, tags) changes; strictly increases on each change. */
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date', precision: 3 }).notNull().defaultNow(),
  },
  (table) => [index('notes_owner_updated_idx').on(table.ownerId, table.updatedAt.desc(), table.id)],
);

export type NoteRow = typeof notes.$inferSelect;
