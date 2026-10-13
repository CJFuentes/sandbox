/** Rendered in place of the page content for an unknown route or a main entity the API reports as 404. */
export function NotFound() {
  return (
    <section data-testid="app-not-found">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or you do not have access to it.</p>
    </section>
  );
}
