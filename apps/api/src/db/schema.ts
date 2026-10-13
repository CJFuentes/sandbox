// Drizzle table definitions. After changing this file, run `pnpm db:generate` to write a migration
// to apps/api/drizzle, then `pnpm db:migrate` to apply it.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stored trimmed and lower-cased, so the unique constraint is case-insensitive. */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
