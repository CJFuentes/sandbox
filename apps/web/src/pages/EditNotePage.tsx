import type { Note } from '@app/shared';
import { Link, useNavigate, useParams } from 'react-router';
import { updateNote } from '../api/notes';
import { FormError } from '../components/FormError';
import { NotFound } from '../components/NotFound';
import { NoteForm } from '../notes/NoteForm';
import { noteChanges, toFormValues } from '../notes/formValues';
import { useNote } from '../notes/useNote';

/** /notes/:noteId/edit (page key `note-form`): the form prefilled with the stored note. */
export function EditNotePage() {
  const noteId = useParams().noteId ?? '';
  const state = useNote(noteId);

  if (state.status === 'loading') return <p className="status">Loading…</p>;
  if (state.status === 'not-found') return <NotFound />;
  if (state.status === 'error') return <FormError testId="note-form-error" error={state.error} />;
  return <EditNoteForm note={state.note} />;
}

function EditNoteForm({ note }: { note: Note }) {
  const navigate = useNavigate();
  const initial = toFormValues(note);

  return (
    <section>
      <h1>Edit note</h1>
      <NoteForm
        key={note.id}
        initial={initial}
        submitLabel="Save"
        onSubmit={async (values) => {
          // Only the changed fields: an untouched field is never rewritten (NOTE-5 keeps updatedAt).
          await updateNote(note.id, noteChanges(initial, values));
          void navigate(`/notes/${note.id}`);
        }}
      />
      <p>
        <Link to={`/notes/${note.id}`}>Cancel</Link>
      </p>
    </section>
  );
}
