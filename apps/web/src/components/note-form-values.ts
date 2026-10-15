// Pure helpers for NoteForm (kept out of the .tsx file for react-refresh). The API normalises tags
// (trim, lower-case, de-duplicate, sort); the client only splits on commas.
import type { CreateNoteBody, Note, UpdateNoteBody } from '@app/shared';

/** "Planning, budget, planning" -> ["Planning", "budget", "planning"]; empty segments are dropped. */
export function parseTagsInput(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

export function formatTagsInput(tags: readonly string[]): string {
  return tags.join(', ');
}

export interface NoteFormValues {
  title: string;
  body: string;
  tags: string;
}

export const EMPTY_NOTE_FORM: NoteFormValues = { title: '', body: '', tags: '' };

export function noteToFormValues(note: Note): NoteFormValues {
  return { title: note.title, body: note.body, tags: formatTagsInput(note.tags) };
}

/** Create: send everything. The title is sent raw (the server trims it); the body is verbatim. */
export function toCreateBody(values: NoteFormValues): CreateNoteBody {
  return { title: values.title, body: values.body, tags: parseTagsInput(values.tags) };
}

/**
 * Edit: only the fields whose form state differs from the prefilled state; an untouched form gives {}.
 * Compares React state strings, never DOM-normalised values, so an untouched CRLF body is not resent
 * (a textarea normalises CRLF to LF) and an unchanged save keeps the note's updatedAt.
 */
export function changedFields(initial: NoteFormValues, current: NoteFormValues): UpdateNoteBody {
  const patch: { title?: string; body?: string; tags?: string[] } = {};
  if (current.title !== initial.title) patch.title = current.title;
  if (current.body !== initial.body) patch.body = current.body;
  const before = parseTagsInput(initial.tags);
  const after = parseTagsInput(current.tags);
  if (before.length !== after.length || before.some((tag, i) => tag !== after[i])) patch.tags = after;
  return patch;
}
