import type { Note } from '@app/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import { listNotes } from '../api/notes';
import { FormError } from '../components/FormError';

type NotesState = { status: 'loading' } | { status: 'loaded'; notes: Note[] } | { status: 'error'; error: ApiError };

/** /notes (page key `notes`): the caller's notes, most recently updated first (API order, NOTE-6). */
export function NotesPage() {
  const [state, setState] = useState<NotesState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listNotes({ limit: 100 }).then(
      (page) => {
        if (!cancelled) setState({ status: 'loaded', notes: page.items });
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
        (state.notes.length === 0 ? (
          <p data-testid="notes-empty">No notes yet.</p>
        ) : (
          <ul className="note-list">
            {state.notes.map((note) => (
              <li key={note.id} data-testid={`notes-row-${note.id}`}>
                <Link to={`/notes/${note.id}`}>
                  <span data-testid={`notes-title-${note.id}`}>{note.title}</span>
                </Link>
                <span className="note-tags" data-testid={`notes-tags-${note.id}`}>
                  {note.tags.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
