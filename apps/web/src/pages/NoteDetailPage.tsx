import { canEditNote } from '@app/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import { deleteNote } from '../api/notes';
import { useCurrentUser } from '../auth/useAuth';
import { FormError } from '../components/FormError';
import { NotFound } from '../components/NotFound';
import { useNote } from '../notes/useNote';

/** `/notes/:noteId`: title, body and tags; edit and delete for whoever may edit the note. */
export function NoteDetailPage() {
  const noteId = useParams().noteId ?? '';
  const load = useNote(noteId);
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);
  const [deletedElsewhere, setDeletedElsewhere] = useState(false);

  if (load.status === 'loading') return <p className="status">Loading…</p>;
  if (load.status === 'not-found' || deletedElsewhere) return <NotFound />;
  if (load.status === 'error') return <FormError testId="note-detail-error" error={load.error} />;

  const { note } = load;
  const canEdit = canEditNote(note, user.id);

  function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    void deleteNote(note.id).then(
      () => navigate('/notes'),
      (caught: unknown) => {
        const error = toApiError(caught);
        if (error.status === 404) {
          setDeletedElsewhere(true);
        } else {
          setDeleteError(error);
          setDeleting(false);
        }
      },
    );
  }

  return (
    <article className="note-detail">
      <h1 data-testid="note-detail-title">{note.title}</h1>
      {note.tags.length > 0 && (
        <ul className="tag-list" aria-label="Tags">
          {note.tags.map((tag) => (
            <li key={tag} className="tag" data-testid={`note-detail-tag-${tag}`}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      <div className="note-body" data-testid="note-detail-body">
        {note.body}
      </div>
      {canEdit && (
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
