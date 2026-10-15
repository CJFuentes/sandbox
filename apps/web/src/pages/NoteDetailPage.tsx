import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import { deleteNote } from '../api/notes';
import { useNote } from '../api/useNote';
import { useCurrentUser } from '../auth/useAuth';
import { FormError } from '../components/FormError';
import { NotFound } from '../components/NotFound';

/** /notes/:noteId (page key `note-detail`). Edit and delete are rendered for the owner only. */
export function NoteDetailPage() {
  const { noteId = '' } = useParams();
  const state = useNote(noteId);
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);
  const [gone, setGone] = useState(false);

  if (gone || state.status === 'not-found') return <NotFound />;
  if (state.status === 'loading') return <p className="status">Loading…</p>;
  if (state.status === 'error') return <FormError testId="note-detail-error" error={state.error} />;

  const { note } = state;
  const isOwner = note.ownerId === user.id;

  function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    void deleteNote(note.id)
      .then(() => navigate('/notes'))
      .catch((caught: unknown) => {
        const error = toApiError(caught);
        if (error.status === 404) {
          setGone(true);
        } else {
          setDeleteError(error);
          setDeleting(false);
        }
      });
  }

  return (
    <article>
      <h1 data-testid="note-detail-title">{note.title}</h1>
      <div className="note-body" data-testid="note-detail-body">
        {note.body}
      </div>
      {note.tags.length > 0 && (
        <ul className="note-tags" aria-label="Tags">
          {note.tags.map((tag) => (
            <li key={tag} data-testid={`note-detail-tag-${tag}`}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <div className="note-actions">
          <Link data-testid="note-detail-edit" to={`/notes/${note.id}/edit`}>
            Edit
          </Link>
          <button type="button" data-testid="note-detail-delete" disabled={deleting} onClick={handleDelete}>
            Delete
          </button>
        </div>
      )}
      <FormError testId="note-detail-error" error={deleteError} />
    </article>
  );
}
