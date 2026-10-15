import type { Note } from '@app/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import { listNotes } from '../api/notes';
import { FormError } from '../components/FormError';

/** The page shows up to this many notes (most recently updated first); a pager is left for later. */
const NOTES_PAGE_LIMIT = 100;

type NotesState =
  | { status: 'loading' }
  | { status: 'loaded'; items: Note[]; total: number }
  | { status: 'error'; error: ApiError };

/** /notes (page key `notes`): the caller's notes in API order (updatedAt desc). */
export function NotesPage() {
  const [state, setState] = useState<NotesState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listNotes({ limit: NOTES_PAGE_LIMIT }).then(
      (list) => {
        if (!cancelled) setState({ status: 'loaded', items: list.items, total: list.total });
      },
      (caught: unknown) => {
        if (!cancelled) setState({ status: 'error', error: toApiError(caught) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <div className="page-header">
        <h1>Notes</h1>
        <Link data-testid="notes-new" to="/notes/new">
          New note
        </Link>
      </div>
      {state.status === 'loading' && <p className="status">Loading…</p>}
      {state.status === 'error' && <FormError testId="notes-error" error={state.error} />}
      {state.status === 'loaded' &&
        (state.items.length === 0 ? (
          <p data-testid="notes-empty">No notes yet.</p>
        ) : (
          <>
            <ul className="notes-list">
              {state.items.map((note) => (
                <li key={note.id} data-testid={`notes-row-${note.id}`}>
                  <Link to={`/notes/${note.id}`}>
                    <span data-testid={`notes-title-${note.id}`}>{note.title}</span>
                  </Link>
                  <span className="notes-tags" data-testid={`notes-tags-${note.id}`}>
                    {note.tags.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
            {state.total > state.items.length && (
              <p className="status" data-testid="notes-more">
                Showing {state.items.length} of {state.total} notes.
              </p>
            )}
          </>
        ))}
    </section>
  );
}
