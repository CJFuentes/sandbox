import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { login } from '../api/auth';
import { toApiError, type ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { FormError } from '../components/FormError';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void login({ email, password })
      .then((response) => {
        signIn(response);
        return navigate('/');
      })
      .catch((caught: unknown) => {
        setError(toApiError(caught));
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <main className="auth-page">
      <h1>Sign in</h1>
      <form noValidate onSubmit={handleSubmit}>
        <label>
          Email
          <input
            data-testid="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <label>
          Password
          <input
            data-testid="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <FormError testId="login-error" error={error} />
        <button data-testid="login-submit" type="submit" disabled={submitting}>
          Sign in
        </button>
      </form>
      <p>
        No account?{' '}
        <Link data-testid="login-register-link" to="/register">
          Create one
        </Link>
      </p>
    </main>
  );
}
