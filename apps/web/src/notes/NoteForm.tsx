import { useState, type SubmitEvent } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { FormError } from '../components/FormError';
import { EMPTY_NOTE_FORM, type NoteFormValues } from './formValues';

export interface NoteFormProps {
  /** Starting values; the edit page passes the stored note (`toFormValues(note)`). */
  initial?: NoteFormValues;
  submitLabel: string;
  /** Saves the values; a rejection (ApiError or anything else) is shown as `note-form-error`. */
  onSubmit: (values: NoteFormValues) => Promise<void>;
}

/**
 * Create and edit form for a note (page key `note-form`). Values are sent as typed: the API trims
 * the title and validates everything, so there are no client-side checks.
 */
export function NoteForm({ initial = EMPTY_NOTE_FORM, submitLabel, onSubmit }: NoteFormProps) {
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
      .catch((caught: unknown) => {
        setError(toApiError(caught));
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
      <label>
        Tags
        <input
          data-testid="note-form-tags"
          type="text"
          aria-describedby="note-form-tags-hint"
          autoCapitalize="none"
          spellCheck={false}
          value={tagsText}
          onChange={(event) => {
            setTagsText(event.target.value);
          }}
        />
      </label>
      <p id="note-form-tags-hint" className="hint">
        Separate tags with commas. Up to 10 tags of a-z, 0-9 and -.
      </p>
      <FormError testId="note-form-error" error={error} />
      <button data-testid="note-form-submit" type="submit" disabled={submitting}>
        {submitLabel}
      </button>
    </form>
  );
}
