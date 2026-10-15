import type { Note } from '@app/shared';
import { useEffect, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { getNote } from '../api/notes';

export type NoteLoad =
  | { status: 'loading' }
  | { status: 'loaded'; note: Note }
  | { status: 'not-found' }
  | { status: 'error'; error: ApiError };

/** Loads one note. The result is keyed by `noteId`, so a param change shows "loading" again. */
export function useNote(noteId: string): NoteLoad {
  const [result, setResult] = useState<{ noteId: string; load: NoteLoad } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getNote(noteId).then(
      (note) => {
        if (!cancelled) setResult({ noteId, load: { status: 'loaded', note } });
      },
      (caught: unknown) => {
        if (cancelled) return;
        const error = toApiError(caught);
        setResult({ noteId, load: error.status === 404 ? { status: 'not-found' } : { status: 'error', error } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [noteId]);
  return result?.noteId === noteId ? result.load : { status: 'loading' };
}
