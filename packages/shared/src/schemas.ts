// Zod building blocks that apply the contract's input rules (docs/contract.md §1.2-§1.5), and the
// auth request schemas. `z.object` drops unknown properties, and nothing here coerces types.
import { z } from 'zod';
import type { ErrorDetail } from './api-types';
import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  countChars,
  isValidDate,
  isValidTimeOfDay,
  isValidTimeZone,
  parseInstant,
} from './formats';

/** Required string: trimmed, then 1 to `max` characters. */
export function requiredString(max: number) {
  return z
    .string()
    .trim()
    .min(1, 'Required')
    .refine((value) => countChars(value) <= max, `At most ${max} characters`);
}

/** Optional text: trimmed, at most `max` characters; empty after trimming becomes `null`. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .refine((value) => countChars(value) <= max, `At most ${max} characters`)
    .transform((value) => (value === '' ? null : value))
    .optional();
}

/** Email: trimmed and lower-cased, then checked against the contract's pattern and length. */
export function email() {
  return z
    .string()
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH, `At most ${EMAIL_MAX_LENGTH} characters`)
    .regex(EMAIL_PATTERN, 'Invalid email');
}

/** Password: 8 to 128 characters, not trimmed. */
export function password() {
  return z.string().refine((value) => {
    const length = countChars(value);
    return length >= 8 && length <= 128;
  }, 'Password must be 8-128 characters');
}

/**
 * An id in a request body (§1.3): a string, trimmed; empty after trimming counts as missing (400).
 * A malformed id passes on purpose: the API queries it with `idEquals()` (apps/api/src/lib/ids.ts),
 * so it is answered like an unknown id (404).
 */
export function entityId() {
  return z.string().trim().min(1, 'Required');
}

/** JSON integer within [min, max]: `1.5` and `"3"` are rejected. */
export function integer(min: number, max: number) {
  return z.int().min(min).max(max);
}

/** RFC 3339 instant with `Z` or an offset, parsed to a `Date`. */
export function instant() {
  return z.string().transform((value, ctx) => {
    const parsed = parseInstant(value);
    if (parsed === null) {
      ctx.issues.push({
        code: 'custom',
        message: 'Invalid date-time: use RFC 3339 with Z or an offset',
        input: value,
      });
      return z.NEVER;
    }
    return parsed;
  });
}

/** Calendar date `YYYY-MM-DD`. */
export function localDate() {
  return z.string().refine(isValidDate, 'Invalid date: use YYYY-MM-DD');
}

/** Time of day `HH:mm` (24-hour); `24:00` only with `allow24`. */
export function timeOfDay(options: { allow24?: boolean } = {}) {
  return z
    .string()
    .refine((value) => isValidTimeOfDay(value, options), 'Invalid time: use HH:mm');
}

/** IANA time zone, trimmed and otherwise kept exactly as sent. */
export function timeZone() {
  return z.string().trim().refine(isValidTimeZone, 'Invalid IANA time zone');
}

/** Query-string integer written in decimal digits, within [min, max]. */
export function queryInt(options: { min: number; max?: number }) {
  const { min, max } = options;
  return z
    .string()
    .regex(/^\d+$/, 'Must be a decimal integer')
    .transform(Number)
    .refine(
      (value) => Number.isSafeInteger(value) && value >= min && (max === undefined || value <= max),
      max === undefined ? `Must be at least ${min}` : `Must be between ${min} and ${max}`,
    );
}

/** Query-string boolean: exactly `true` or `false`. */
export function queryBool() {
  return z.enum(['true', 'false']).transform((value) => value === 'true');
}

/** Converts Zod issues to the contract's `details` entries (dotted paths, "" for the root). */
export function zodIssuesToDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

export const registerBodySchema = z.object({
  email: email(),
  password: password(),
  name: requiredString(80),
});
export type RegisterBody = z.input<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
});
export type LoginBody = z.input<typeof loginBodySchema>;
