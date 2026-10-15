// Notes (issue #94): wire type, input rules NOTE-2/NOTE-3 and the edit permission (NOTE-5),
// shared by apps/api and apps/web.
import { z } from 'zod';
import type { Instant } from './api-types';
import { countChars } from './formats';
import { requiredString } from './schemas';

export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 20_000;
export const NOTE_TAGS_MAX = 10;
export const NOTE_TAG_PATTERN = /^[a-z0-9-]{1,30}$/;

export interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  /** Normalised, distinct, ascending. */
  tags: string[];
  createdAt: Instant;
  updatedAt: Instant;
}

const noNul = (value: string) => !value.includes('\u0000');

/** NOTE-2: trimmed, 1-120 characters. */
export function noteTitle() {
  return requiredString(NOTE_TITLE_MAX).refine(noNul, 'Must not contain NUL characters');
}

/** NOTE-2: kept verbatim (never trimmed), 0-20000 characters, never null. */
export function noteBody() {
  return z
    .string()
    .refine((value) => countChars(value) <= NOTE_BODY_MAX, `At most ${NOTE_BODY_MAX} characters`)
    .refine(noNul, 'Must not contain NUL characters');
}

/** NOTE-3: one tag, trimmed and lower-cased, then matched. A failure's path is `tags.<index>`. */
export function noteTag() {
  return z.string().trim().toLowerCase().regex(NOTE_TAG_PATTERN, 'Tag must be 1-30 characters of a-z, 0-9 or "-"');
}

/** NOTE-3: list of tags. More than 10 distinct gives path `tags`. Output is distinct and sorted. */
export function noteTags() {
  return z
    .array(noteTag())
    .refine((tags) => new Set(tags).size <= NOTE_TAGS_MAX, `At most ${NOTE_TAGS_MAX} distinct tags`)
    .transform((tags) => [...new Set(tags)].toSorted());
}

export const createNoteBodySchema = z.object({
  title: noteTitle(),
  body: noteBody().default(''),
  tags: noteTags().default([]),
});
export type CreateNoteBody = z.input<typeof createNoteBodySchema>;
export type CreateNoteInput = z.output<typeof createNoteBodySchema>;

export const updateNoteBodySchema = z.object({
  title: noteTitle().optional(),
  body: noteBody().optional(),
  tags: noteTags().optional(),
});
export type UpdateNoteBody = z.input<typeof updateNoteBodySchema>;
export type UpdateNoteInput = z.output<typeof updateNoteBodySchema>;

/**
 * NOTE-5: who may edit or delete a note. Single source for the API (403) and the web app
 * (owner-only controls). C02 changes this only if non-owners get edit rights.
 */
export function canEditNote(note: { ownerId: string }, userId: string): boolean {
  return note.ownerId === userId;
}
