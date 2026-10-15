import { createNote } from '../api/notes';
import { NoteForm } from '../components/NoteForm';
import { createBodyFromForm, EMPTY_NOTE_FORM } from '../notes/note-form-values';

export function NewNotePage() {
  return (
    <section className="note-form-page">
      <h1>New note</h1>
      <NoteForm
        initial={EMPTY_NOTE_FORM}
        submitLabel="Create note"
        onSubmit={(values) => createNote(createBodyFromForm(values))}
      />
    </section>
  );
}
