import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { NotFound } from './components/NotFound';
import { EditNotePage } from './pages/EditNotePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NewNotePage } from './pages/NewNotePage';
import { NoteDetailPage } from './pages/NoteDetailPage';
import { NotesPage } from './pages/NotesPage';
import { RegisterPage } from './pages/RegisterPage';

/**
 * Routes. /login and /register are public; every other route is signed-in only (a signed-out
 * visit redirects to /login) and renders inside <Layout> (nav bar). Add feature pages inside the
 * signed-in group; unknown routes render `app-not-found`.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="notes/new" element={<NewNotePage />} />
        <Route path="notes/:noteId" element={<NoteDetailPage />} />
        <Route path="notes/:noteId/edit" element={<EditNotePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
