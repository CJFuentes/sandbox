import type { Note } from '@app/shared';
import { useId, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { toApiError, type ApiError } from '../api/client';
import type { NoteFormValues } from '../notes/note-form-values';
import { FormError } from './FormError';

/**
 * Create and edit form for a note (page key `note-form`). Values are sent as typed: the server
 * trims the title, keeps the body verbatim and normalises the tags. A successful submit navigates
 * to the note's page. When `onNotFound` is given, a 404 from the submit is handed to it instead of
 * being shown as a form error (the edit page then renders not-found, contract §1.9).
 */
export function NoteForm({
  initial,
  submitLabel,
  onSubmit,
  onNotFound,
}: {
  initial: NoteFormValues;
  submitLabel: string;
  onSubmit: (values: NoteFormValues) => Promise<Note>;
  onNotFound?: () => void;
}) {
  const navigate = useNavigate();
  const tagsHintId = useId();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [tagsText, setTagsText] = useState(initial.tagsText);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void onSubmit({ title, body, tagsText })
      .then((note) => navigate(`/notes/${note.id}`))
      .catch((caught: unknown) => {
        const apiError = toApiError(caught);
        if (apiError.status === 404 && onNotFound) {
          onNotFound();
        } else {
          setError(apiError);
        }
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <form className="note-form" noValidate onSubmit={handleSubmit}>
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
      <div className="field">
        <label>
          Tags
          <input
            data-testid="note-form-tags"
            type="text"
            autoComplete="off"
            aria-describedby={tagsHintId}
            value={tagsText}
            onChange={(event) => {
              setTagsText(event.target.value);
            }}
          />
        </label>
        <p id={tagsHintId} className="field-hint">
          Separate tags with commas, for example: planning, budget
        </p>
      </div>
      <FormError testId="note-form-error" error={error} />
      <button data-testid="note-form-submit" type="submit" disabled={submitting}>
        {submitLabel}
      </button>
    </form>
  );
}
