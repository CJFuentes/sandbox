// Note rules NOTE-2 / NOTE-3 (issue #98): request schemas for POST and PATCH /notes.
import { z } from 'zod';
import { countChars } from './formats';
import { requiredString } from './schemas';

export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 20_000;
export const NOTE_TAG_PATTERN = /^[a-z0-9-]{1,30}$/;
export const NOTE_MAX_TAGS = 10;

const UNPAIRED_SURROGATE = /\p{Cs}/u;
const INVALID_CHARS_MESSAGE = 'Must not contain NUL characters or unpaired surrogates';

/**
 * PostgreSQL text cannot hold U+0000 (SQLSTATE 22021 -> would be a 500), and it stores an unpaired UTF-16
 * surrogate as U+FFFD (the value would come back changed). Both are rejected (400) before reaching SQL.
 */
export function hasStorableChars(value: string): boolean {
  return !value.includes('\u0000') && !UNPAIRED_SURROGATE.test(value);
}

/** Title: trimmed, 1-120 characters, storable characters only. */
export function noteTitle() {
  return requiredString(NOTE_TITLE_MAX).refine(hasStorableChars, INVALID_CHARS_MESSAGE);
}

/** One tag: trimmed and lower-cased, then 1-30 of a-z, 0-9, '-'. Error path: tags.<index in the request>. */
export function noteTag() {
  return z
    .string()
    .trim()
    .toLowerCase()
    .regex(NOTE_TAG_PATTERN, 'Tags are 1-30 characters: a-z, 0-9 and -');
}

/** Tag list: each tag normalised, duplicates removed, sorted ascending; more than 10 distinct -> path "tags". */
export function noteTags() {
  return z
    .array(noteTag())
    .transform((tags) => [...new Set(tags)].sort())
    .refine((tags) => tags.length <= NOTE_MAX_TAGS, `At most ${NOTE_MAX_TAGS} different tags`);
}

/** Body: any string up to 20000 characters, kept verbatim (NOT trimmed). null -> 400. */
export function noteBody() {
  return z
    .string()
    .refine((value) => countChars(value) <= NOTE_BODY_MAX, `At most ${NOTE_BODY_MAX} characters`)
    .refine(hasStorableChars, INVALID_CHARS_MESSAGE);
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
