import { Link, Outlet, useNavigate } from 'react-router';
import { useAuth, useCurrentUser } from '../auth/useAuth';

/** Shell of every signed-in page: the nav bar, then the page. Features add nav links as `nav-<name>`. */
export function Layout() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <header className="nav">
        <nav>
          <Link data-testid="nav-home" to="/">
            Home
          </Link>
          <Link data-testid="nav-notes" to="/notes">
            Notes
          </Link>
        </nav>
        <div className="nav-account">
          <span data-testid="nav-user">{user.email}</span>
          <button
            type="button"
            data-testid="nav-logout"
            onClick={() => {
              signOut();
              void navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
