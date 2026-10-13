import { useCurrentUser } from '../auth/useAuth';

export function HomePage() {
  const user = useCurrentUser();
  return (
    <section>
      <h1 data-testid="home-greeting">Welcome, {user.name}</h1>
    </section>
  );
}
