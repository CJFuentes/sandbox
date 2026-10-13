// List envelope and paging (docs/contract.md §1.5).
import { queryInt, type ListResponse } from '@app/shared';
import { z } from 'zod';

/** `limit` 1-100 (default 20) and `offset` >= 0 (default 0). Extend it with a list's own filters. */
export const paginationQuery = z.object({
  limit: queryInt({ min: 1, max: 100 }).default(20),
  offset: queryInt({ min: 0 }).default(0),
});
export type Pagination = z.output<typeof paginationQuery>;

/** `{ items, total, limit, offset }`; `total` counts every match, ignoring limit and offset. */
export function listResponse<T>(items: T[], total: number, page: Pagination): ListResponse<T> {
  return { items, total, limit: page.limit, offset: page.offset };
}
