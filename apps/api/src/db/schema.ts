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
    title: text('title').notNull(),
    /** Verbatim, never trimmed (NOTE-2). */
    body: text('body').notNull().default(''),
    /** Normalised, distinct, sorted ascending (NOTE-3). */
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    /** Millisecond precision on purpose (D2). Written with writeStamp() (D3), not the default. */
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date', precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date', precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    // Matches ORDER BY updated_at DESC (= DESC NULLS FIRST in PostgreSQL), id ASC (D10).
    index('notes_owner_updated_id_idx').on(table.ownerId, table.updatedAt.desc().nullsFirst(), table.id),
  ],
);

export type NoteRow = typeof notes.$inferSelect;
