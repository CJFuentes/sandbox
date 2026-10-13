import type { ApiError } from '../api/client';

/**
 * A form's error element: rendered only while there is an error, with the API error code in
 * `data-error-code` (docs/contract.md §1.9).
 */
export function FormError({ testId, error }: { testId: string; error: ApiError | null }) {
  if (error === null) return null;
  return (
    <p className="form-error" role="alert" data-testid={testId} data-error-code={error.code}>
      {error.message}
    </p>
  );
}
