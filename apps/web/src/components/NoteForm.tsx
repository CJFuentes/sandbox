import type { Note } from '@app/shared';
import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import { FormError } from './FormError';
import type { NoteFormValues } from './note-form-values';

interface NoteFormProps {
  initial: NoteFormValues;
  submitLabel: string;
  /** Sends the values (the page decides what to send) and resolves with the stored note. */
  onSubmit: (values: NoteFormValues) => Promise<Note>;
}

/**
 * Create/edit form for a note (page key `note-form`). No client-side checks: every error comes from
 * the API, so `note-form-error` carries the API error code. A successful submit opens the note.
 */
export function NoteForm({ initial, submitLabel, onSubmit }: NoteFormProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [tags, setTags] = useState(initial.tags);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void onSubmit({ title, body, tags })
      .then((note) => navigate(`/notes/${note.id}`))
      .catch((caught: unknown) => {
        setError(toApiError(caught));
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <label>
        Title
        <input
          data-testid="note-form-title"
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </label>
      <label>
        Body
        <textarea
          data-testid="note-form-body"
          rows={10}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </label>
      <label>
        Tags (comma-separated)
        <input
          data-testid="note-form-tags"
          type="text"
          autoComplete="off"
          value={tags}
          onChange={(event) => {
            setTags(event.target.value);
          }}
        />
      </label>
      <FormError testId="note-form-error" error={error} />
      <button data-testid="note-form-submit" type="submit" disabled={submitting}>
        {submitLabel}
      </button>
    </form>
  );
}
