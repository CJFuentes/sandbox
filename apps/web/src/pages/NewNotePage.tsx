import { createNote } from '../api/notes';
import { NoteForm } from '../components/NoteForm';
import { EMPTY_NOTE_FORM, toCreateBody } from '../components/note-form-values';

/** /notes/new (page key `note-form`). */
export function NewNotePage() {
  return (
    <section>
      <h1>New note</h1>
      <NoteForm
        initial={EMPTY_NOTE_FORM}
        submitLabel="Create note"
        onSubmit={(values) => createNote(toCreateBody(values))}
      />
    </section>
  );
}
