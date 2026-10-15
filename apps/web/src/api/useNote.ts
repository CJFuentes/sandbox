import type { Note } from '@app/shared';
import { useEffect, useState } from 'react';
import { toApiError, type ApiError } from './client';
import { getNote } from './notes';

export type NoteState =
  | { status: 'loading' }
  | { status: 'loaded'; note: Note }
  | { status: 'not-found' }
  | { status: 'error'; error: ApiError };

const LOADING: NoteState = { status: 'loading' };

/**
 * Loads one note. The result is tagged with the id it belongs to, so a change of `noteId` shows
 * "loading" at once without the effect calling setState synchronously.
 */
export function useNote(noteId: string): NoteState {
  const [loaded, setLoaded] = useState<{ noteId: string; state: NoteState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNote(noteId).then(
      (note) => {
        if (!cancelled) setLoaded({ noteId, state: { status: 'loaded', note } });
      },
      (caught: unknown) => {
        if (cancelled) return;
        const error = toApiError(caught);
        setLoaded({ noteId, state: error.status === 404 ? { status: 'not-found' } : { status: 'error', error } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  return loaded?.noteId === noteId ? loaded.state : LOADING;
}
