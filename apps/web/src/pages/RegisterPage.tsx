import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { register } from '../api/auth';
import { toApiError, type ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { FormError } from '../components/FormError';

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void register({ name, email, password })
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
      <h1>Create an account</h1>
      <form noValidate onSubmit={handleSubmit}>
        <label>
          Name
          <input
            data-testid="register-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <label>
          Email
          <input
            data-testid="register-email"
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
            data-testid="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <FormError testId="register-error" error={error} />
        <button data-testid="register-submit" type="submit" disabled={submitting}>
          Create account
        </button>
      </form>
      <p>
        Already registered?{' '}
        <Link data-testid="register-login-link" to="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
