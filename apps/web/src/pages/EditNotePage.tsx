import { useParams } from 'react-router';
import { updateNote } from '../api/notes';
import { useNote } from '../api/useNote';
import { FormError } from '../components/FormError';
import { NoteForm } from '../components/NoteForm';
import { NotFound } from '../components/NotFound';
import { changedFields, noteToFormValues } from '../components/note-form-values';

/** /notes/:noteId/edit (page key `note-form`): prefilled with the stored note; saves only changed fields. */
export function EditNotePage() {
  const { noteId = '' } = useParams();
  const state = useNote(noteId);

  if (state.status === 'not-found') return <NotFound />;
  if (state.status === 'loading') return <p className="status">Loading…</p>;
  if (state.status === 'error') return <FormError testId="note-form-error" error={state.error} />;

  const { note } = state;
  const initial = noteToFormValues(note);
  return (
    <section>
      <h1>Edit note</h1>
      <NoteForm
        key={note.id}
        initial={initial}
        submitLabel="Save"
        onSubmit={(values) => updateNote(note.id, changedFields(initial, values))}
      />
    </section>
  );
}
