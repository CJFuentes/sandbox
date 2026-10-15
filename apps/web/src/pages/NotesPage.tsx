import type { Note } from '@app/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import { listNotes } from '../api/notes';
import { FormError } from '../components/FormError';

type NotesLoad = { status: 'loading' } | { status: 'loaded'; notes: Note[] } | { status: 'error'; error: ApiError };

/** `/notes`: the caller's notes, most recently updated first (API order). */
export function NotesPage() {
  const [load, setLoad] = useState<NotesLoad>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listNotes({ limit: 100 }).then(
      (page) => {
        if (!cancelled) setLoad({ status: 'loaded', notes: page.items });
      },
      (caught: unknown) => {
        if (!cancelled) setLoad({ status: 'error', error: toApiError(caught) });
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
      {load.status === 'loading' && <p className="status">Loading…</p>}
      {load.status === 'error' && <FormError testId="notes-error" error={load.error} />}
      {load.status === 'loaded' && load.notes.length === 0 && <p data-testid="notes-empty">No notes yet.</p>}
      {load.status === 'loaded' && load.notes.length > 0 && (
        <ul className="notes-list">
          {load.notes.map((note) => (
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
      )}
    </section>
  );
}
