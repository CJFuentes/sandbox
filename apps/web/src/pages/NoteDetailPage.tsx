import type { Note } from '@app/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import { deleteNote } from '../api/notes';
import { useCurrentUser } from '../auth/useAuth';
import { FormError } from '../components/FormError';
import { NotFound } from '../components/NotFound';
import { useNote } from '../notes/useNote';

/** /notes/:noteId (page key `note-detail`). */
export function NoteDetailPage() {
  const noteId = useParams().noteId ?? '';
  const state = useNote(noteId);

  if (state.status === 'loading') return <p className="status">Loading…</p>;
  if (state.status === 'not-found') return <NotFound />;
  if (state.status === 'error') return <FormError testId="note-detail-error" error={state.error} />;
  return <NoteDetail key={state.note.id} note={state.note} />;
}

function NoteDetail({ note }: { note: Note }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const isOwner = note.ownerId === user.id;

  function handleDelete() {
    setError(null);
    setDeleting(true);
    void deleteNote(note.id).then(
      () => navigate('/notes'),
      (caught: unknown) => {
        const apiError = toApiError(caught);
        // Already gone (deleted elsewhere): the outcome the user asked for.
        if (apiError.status === 404) return navigate('/notes');
        setError(apiError);
        setDeleting(false);
      },
    );
  }

  return (
    <article>
      <h1 data-testid="note-detail-title">{note.title}</h1>
      {note.tags.length > 0 && (
        <ul className="note-tag-list" aria-label="Tags">
          {note.tags.map((tag) => (
            <li key={tag} className="note-tag" data-testid={`note-detail-tag-${tag}`}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      <div className="note-body" data-testid="note-detail-body">
        {note.body}
      </div>
      <FormError testId="note-detail-error" error={error} />
      {isOwner && (
        <div className="actions">
          <Link data-testid="note-detail-edit" to={`/notes/${note.id}/edit`}>
            Edit
          </Link>
          <button type="button" data-testid="note-detail-delete" disabled={deleting} onClick={handleDelete}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </article>
  );
}
