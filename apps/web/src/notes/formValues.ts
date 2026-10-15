// Pure helpers for the note form (no React): the form's string values, tag parsing and the edit diff.
import type { Note, UpdateNoteBody } from '@app/shared';

/** The note form's controlled values. Tags are edited as one comma-separated string. */
export interface NoteFormValues {
  title: string;
  body: string;
  tagsText: string;
}

export const EMPTY_NOTE_FORM: NoteFormValues = { title: '', body: '', tagsText: '' };

/** "a, B ,,c" -> ["a", "B", "c"]. The API normalises and validates the tags (NOTE-3). */
export function parseTagsInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

export function formatTagsInput(tags: readonly string[]): string {
  return tags.join(', ');
}

/** The edit form's initial values: title and body exactly as stored. */
export function toFormValues(note: Note): NoteFormValues {
  return { title: note.title, body: note.body, tagsText: formatTagsInput(note.tags) };
}

/** Only the fields the user changed; `{}` when nothing changed. */
export function noteChanges(initial: NoteFormValues, current: NoteFormValues): UpdateNoteBody {
  const changes: UpdateNoteBody = {};
  if (current.title !== initial.title) changes.title = current.title;
  if (current.body !== initial.body) changes.body = current.body;
  if (current.tagsText !== initial.tagsText) changes.tags = parseTagsInput(current.tagsText);
  return changes;
}
