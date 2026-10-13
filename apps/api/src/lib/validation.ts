// Request validation with Zod (docs/contract.md §1.2-§1.5). Use these in handlers instead of
// Fastify route schemas: they trim strings, never coerce body types, and report `details` paths.
import { zodIssuesToDetails } from '@app/shared';
import type { z } from 'zod';
import { validationError } from './errors';

/** Validates a JSON body. A missing or empty body is treated as `{}`. Throws 400 VALIDATION_FAILED. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  // `undefined` = no body was sent. A JSON `null` body is a non-object and fails like one.
  const result = schema.safeParse(body === undefined ? {} : body);
  if (!result.success) throw validationError(zodIssuesToDetails(result.error));
  return result.data;
}

/**
 * Validates a query string. Parameters sent with an empty value (`?q=`) count as absent (§1.5).
 * Query values are strings: use `queryInt` / `queryBool` from @app/shared for numbers and booleans.
 */
export function parseQuery<S extends z.ZodType>(schema: S, query: unknown): z.output<S> {
  const present =
    typeof query === 'object' && query !== null
      ? Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''))
      : {};
  const result = schema.safeParse(present);
  if (!result.success) throw validationError(zodIssuesToDetails(result.error));
  return result.data;
}
