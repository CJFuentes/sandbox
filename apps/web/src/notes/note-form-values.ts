// Note form state and the request bodies built from it (issue #94). Pure, no React.
import type { CreateNoteBody, Note, UpdateNoteBody } from '@app/shared';

/** Raw form state: exactly what the inputs hold. */
export interface NoteFormValues {
  title: string;
  body: string;
  tagsText: string;
}

export const EMPTY_NOTE_FORM: NoteFormValues = { title: '', body: '', tagsText: '' };

/** Comma-separated input → tags; drops empty segments only (the server normalises and validates). */
export function parseTagsInput(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

export function formatTagsInput(tags: readonly string[]): string {
  return tags.join(', ');
}

/** Prefill values for the edit form (contract: "The edit form is prefilled"). */
export function noteFormValues(note: Note): NoteFormValues {
  return { title: note.title, body: note.body, tagsText: formatTagsInput(note.tags) };
}

/** Create: title and body as typed (the server trims the title and keeps the body verbatim). */
export function createBodyFromForm(values: NoteFormValues): CreateNoteBody {
  return { title: values.title, body: values.body, tags: parseTagsInput(values.tagsText) };
}

/**
 * Edit: only the fields whose form value differs from the prefilled value, so an untouched form
 * sends `{}` and a stale tab never overwrites fields it did not change.
 */
export function updateBodyFromForm(initial: NoteFormValues, values: NoteFormValues): UpdateNoteBody {
  const body: UpdateNoteBody = {};
  if (values.title !== initial.title) body.title = values.title;
  if (values.body !== initial.body) body.body = values.body;
  if (values.tagsText !== initial.tagsText) body.tags = parseTagsInput(values.tagsText);
  return body;
}
