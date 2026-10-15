import type { Note } from '@app/shared';
import { useEffect, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { getNote } from '../api/notes';

export type NoteState =
  | { status: 'loading' }
  | { status: 'loaded'; note: Note }
  | { status: 'not-found' }
  | { status: 'error'; error: ApiError };

type Settled = Exclude<NoteState, { status: 'loading' }>;

/**
 * Loads one note. The result is stored with the id it belongs to, so a different (or not yet
 * loaded) id reads as loading without a synchronous setState in the effect. A 404 (unknown,
 * malformed or someone else's note) is `not-found`.
 */
export function useNote(noteId: string): NoteState {
  const [settled, setSettled] = useState<{ noteId: string; state: Settled } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNote(noteId).then(
      (note) => {
        if (!cancelled) setSettled({ noteId, state: { status: 'loaded', note } });
      },
      (caught: unknown) => {
        if (cancelled) return;
        const error = toApiError(caught);
        setSettled({
          noteId,
          state: error.status === 404 ? { status: 'not-found' } : { status: 'error', error },
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  return settled === null || settled.noteId !== noteId ? { status: 'loading' } : settled.state;
}
