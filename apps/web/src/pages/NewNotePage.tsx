import { useNavigate } from 'react-router';
import { createNote } from '../api/notes';
import { NoteForm } from '../notes/NoteForm';
import { parseTagsInput } from '../notes/formValues';

/** /notes/new (page key `note-form`): creates a note, then opens it. */
export function NewNotePage() {
  const navigate = useNavigate();

  return (
    <section>
      <h1>New note</h1>
      <NoteForm
        submitLabel="Create"
        onSubmit={async (values) => {
          const note = await createNote({
            title: values.title,
            body: values.body,
            tags: parseTagsInput(values.tagsText),
          });
          void navigate(`/notes/${note.id}`);
        }}
      />
    </section>
  );
}
