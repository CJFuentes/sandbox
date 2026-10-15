import { canEditNote } from '@app/shared';
import { useState } from 'react';
import { useParams } from 'react-router';
import { updateNote } from '../api/notes';
import { useCurrentUser } from '../auth/useAuth';
import { Forbidden } from '../components/Forbidden';
import { FormError } from '../components/FormError';
import { NoteForm } from '../components/NoteForm';
import { NotFound } from '../components/NotFound';
import { noteFormValues, updateBodyFromForm } from '../notes/note-form-values';
import { useNote } from '../notes/useNote';

/** `/notes/:noteId/edit`: the prefilled form; saving sends only the fields the user changed. */
export function EditNotePage() {
  const noteId = useParams().noteId ?? '';
  const load = useNote(noteId);
  const user = useCurrentUser();
  // Set when a save gets 404: the note was deleted after the form loaded.
  const [deletedElsewhere, setDeletedElsewhere] = useState(false);

  if (load.status === 'loading') return <p className="status">Loading…</p>;
  if (load.status === 'not-found' || deletedElsewhere) return <NotFound />;
  if (load.status === 'error') return <FormError testId="note-form-error" error={load.error} />;

  const { note } = load;
  if (!canEditNote(note, user.id)) return <Forbidden />;

  // The same object prefills the form and is the baseline of the diff.
  const initial = noteFormValues(note);
  return (
    <section className="note-form-page">
      <h1>Edit note</h1>
      <NoteForm
        key={note.id}
        initial={initial}
        submitLabel="Save"
        onSubmit={(values) => updateNote(note.id, updateBodyFromForm(initial, values))}
        onNotFound={() => {
          setDeletedElsewhere(true);
        }}
      />
    </section>
  );
}
