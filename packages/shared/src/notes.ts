// Notes (issue #96, rules NOTE-1 to NOTE-6): the Note type and the request schemas for creating and
// editing a note. See docs/contract.md for the general input rules these build on.
import { z } from 'zod';
import type { Instant } from './api-types';
import { countChars } from './formats';
import { requiredString } from './schemas';

export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 20_000;
export const NOTE_TAG_PATTERN = /^[a-z0-9-]{1,30}$/;
export const NOTE_MAX_TAGS = 10;

export interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  /** Lower-case, distinct, sorted ascending. */
  tags: string[];
  createdAt: Instant;
  updatedAt: Instant;
}

// With the `u` flag, \p{Cs} matches only unpaired surrogates (a valid pair is one code point).
const UNPAIRED_SURROGATE = /\p{Cs}/u;
const STORABLE_MESSAGE = 'Must not contain NUL or unpaired surrogate characters';

/**
 * Text PostgreSQL can store verbatim: no U+0000 (rejected with SQLSTATE 22021) and no unpaired
 * surrogates (node-postgres would store them as U+FFFD).
 */
export function isStorableText(value: string): boolean {
  return !value.includes('\u0000') && !UNPAIRED_SURROGATE.test(value);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** NOTE-2 title: trimmed, then 1-120 characters, storable. */
export function noteTitle() {
  return requiredString(NOTE_TITLE_MAX).refine(isStorableText, STORABLE_MESSAGE);
}

/** NOTE-2 body: not trimmed, 0-20000 characters, storable, never null. */
export function noteBody() {
  return z
    .string()
    .refine((value) => countChars(value) <= NOTE_BODY_MAX, `At most ${NOTE_BODY_MAX} characters`)
    .refine(isStorableText, STORABLE_MESSAGE);
}

/**
 * NOTE-3 tags: each element is trimmed and lower-cased, then checked (path `tags.<index>`); the
 * list is de-duplicated, limited to 10 distinct tags (path `tags`) and sorted ascending.
 */
export function noteTags() {
  return z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(NOTE_TAG_PATTERN, 'Tags are 1-30 characters of a-z, 0-9 and -'),
    )
    .transform((tags, ctx) => {
      const distinct = [...new Set(tags)].sort(compareStrings);
      if (distinct.length > NOTE_MAX_TAGS) {
        ctx.issues.push({ code: 'custom', message: `At most ${NOTE_MAX_TAGS} distinct tags`, input: tags });
        return z.NEVER;
      }
      return distinct;
    });
}

export const createNoteBodySchema = z.object({
  title: noteTitle(),
  body: noteBody().default(''),
  tags: noteTags().default([]),
});
export type CreateNoteBody = z.input<typeof createNoteBodySchema>;

export const updateNoteBodySchema = z.object({
  title: noteTitle().optional(),
  body: noteBody().optional(),
  tags: noteTags().optional(),
});
export type UpdateNoteBody = z.input<typeof updateNoteBodySchema>;
