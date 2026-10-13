/** Rendered in place of the page content when the caller's role may not use the page (API 403). */
export function Forbidden() {
  return (
    <section data-testid="app-forbidden">
      <h1>Not allowed</h1>
      <p>Your role does not allow you to use this page.</p>
    </section>
  );
}
