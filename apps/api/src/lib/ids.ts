// Id conditions for queries (docs/contract.md §1.3). Ids are UUIDs, and a malformed id must behave
// like an unknown one: it never reaches a uuid column (where PostgreSQL would reject it).
import { isUuid } from '@app/shared';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * `column = id`, or a condition that matches nothing when `id` is not a UUID. Use it for every id
 * that comes from a request: as a list filter a malformed id then yields an empty list, and in a
 * lookup the missing row becomes your `notFound()`.
 */
export function idEquals(column: AnyPgColumn, id: string): SQL {
  return isUuid(id) ? eq(column, id) : sql`false`;
}
