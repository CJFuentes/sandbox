import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const TOKEN_KEY = 'auth.token';

interface NoteResponse {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
}

/** Registers a user through the API (via the web server's /api proxy) and returns its token. */
async function registerViaApi(request: APIRequestContext, name: string) {
  const email = `e2e-notes-${randomUUID()}@example.test`;
  const response = await request.post('/api/v1/auth/register', {
    data: { email, password: 'correct-horse-battery', name },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { token: string };
  return { email, name, token: body.token };
}

async function signInWithToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [TOKEN_KEY, token] as const,
  );
}

async function createNoteViaApi(
  request: APIRequestContext,
  token: string,
  data: { title: string; body?: string; tags?: string[] },
): Promise<NoteResponse> {
  const response = await request.post('/api/v1/notes', { data, headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(201);
  return (await response.json()) as NoteResponse;
}

function noteIdFromUrl(page: Page): string {
  const match = /\/notes\/([^/?#]+)$/.exec(new URL(page.url()).pathname);
  if (match?.[1] === undefined) throw new Error(`not on a note page: ${page.url()}`);
  return match[1];
}

test('creates a note with tags from the nav bar, edits its tags and deletes it', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  await signInWithToken(page, lena.token);

  await page.goto('/');
  await page.getByTestId('nav-notes').click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByTestId('notes-empty')).toBeVisible();

  await page.getByTestId('notes-new').click();
  await expect(page).toHaveURL(/\/notes\/new$/);
  await page.getByTestId('note-form-title').fill('Q3 planning');
  await page.getByTestId('note-form-body').fill('Hiring and budget');
  await page.getByTestId('note-form-tags').fill('Planning, budget, planning');
  await page.getByTestId('note-form-submit').click();

  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const noteId = noteIdFromUrl(page);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Q3 planning');
  await expect(page.getByTestId('note-detail-body')).toHaveText('Hiring and budget');
  await expect(page.getByTestId('note-detail-tag-budget')).toBeVisible();
  await expect(page.getByTestId('note-detail-tag-planning')).toBeVisible();
  await expect(page.locator('[data-testid^="note-detail-tag-"]')).toHaveCount(2);

  await page.getByTestId('nav-notes').click();
  await expect(page.getByTestId(`notes-title-${noteId}`)).toHaveText('Q3 planning');
  await expect(page.getByTestId(`notes-tags-${noteId}`)).toContainText('budget');
  await expect(page.getByTestId(`notes-tags-${noteId}`)).toContainText('planning');
  await expect(page.getByTestId('notes-empty')).toHaveCount(0);

  // Edit: the form is prefilled; only the tags change.
  await page.getByTestId(`notes-row-${noteId}`).locator('a').first().click();
  await page.getByTestId('note-detail-edit').click();
  await expect(page).toHaveURL(new RegExp(`/notes/${noteId}/edit$`));
  await expect(page.getByTestId('note-form-title')).toHaveValue('Q3 planning');
  await expect(page.getByTestId('note-form-body')).toHaveValue('Hiring and budget');
  await expect(page.getByTestId('note-form-tags')).toHaveValue('budget, planning');
  await page.getByTestId('note-form-tags').fill('ideas');
  await page.getByTestId('note-form-submit').click();

  await expect(page).toHaveURL(new RegExp(`/notes/${noteId}$`));
  await expect(page.getByTestId('note-detail-tag-ideas')).toBeVisible();
  await expect(page.locator('[data-testid^="note-detail-tag-"]')).toHaveCount(1);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Q3 planning');

  // Delete: at once, then back to the list without the note.
  await page.getByTestId('note-detail-delete').click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByTestId('notes-empty')).toBeVisible();
  await expect(page.getByTestId(`notes-row-${noteId}`)).toHaveCount(0);

  const response = await request.get(`/api/v1/notes/${noteId}`, { headers: { Authorization: `Bearer ${lena.token}` } });
  expect(response.status()).toBe(404);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
});

test('the most recently updated note is listed first', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  const retro = await createNoteViaApi(request, lena.token, { title: 'Retro notes' });
  const q3 = await createNoteViaApi(request, lena.token, { title: 'Q3 planning' });
  await signInWithToken(page, lena.token);

  await page.goto('/notes');
  const rows = page.locator('[data-testid^="notes-row-"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-testid', `notes-row-${q3.id}`);
  await expect(rows.nth(1)).toHaveAttribute('data-testid', `notes-row-${retro.id}`);

  await page.goto(`/notes/${retro.id}/edit`);
  await page.getByTestId('note-form-title').fill('Retro notes (final)');
  await page.getByTestId('note-form-submit').click();
  await expect(page.getByTestId('note-detail-title')).toHaveText('Retro notes (final)');

  await page.getByTestId('nav-notes').click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-testid', `notes-row-${retro.id}`);
  await expect(page.getByTestId(`notes-title-${retro.id}`)).toHaveText('Retro notes (final)');
  await expect(rows.nth(1)).toHaveAttribute('data-testid', `notes-row-${q3.id}`);

  // Saving Q3 unchanged keeps its update time and the order.
  await page.goto(`/notes/${q3.id}/edit`);
  await expect(page.getByTestId('note-form-title')).toHaveValue('Q3 planning');
  await page.getByTestId('note-form-submit').click();
  await expect(page).toHaveURL(new RegExp(`/notes/${q3.id}$`));
  await expect(page.getByTestId('note-detail-title')).toHaveText('Q3 planning');
  const after = await request.get(`/api/v1/notes/${q3.id}`, { headers: { Authorization: `Bearer ${lena.token}` } });
  expect(((await after.json()) as NoteResponse).updatedAt).toBe(q3.updatedAt);

  await page.getByTestId('nav-notes').click();
  await expect(rows.nth(0)).toHaveAttribute('data-testid', `notes-row-${retro.id}`);
  await expect(rows.nth(1)).toHaveAttribute('data-testid', `notes-row-${q3.id}`);
});

test("another user's note is not found, and they never see it in their list", async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  const sam = await registerViaApi(request, 'Sam');
  const note = await createNoteViaApi(request, lena.token, { title: 'Q3 planning', tags: ['budget'] });
  await signInWithToken(page, sam.token);

  await page.goto(`/notes/${note.id}`);
  await expect(page.getByTestId('app-not-found')).toBeVisible();
  await expect(page.getByTestId('note-detail-title')).toHaveCount(0);

  await page.goto(`/notes/${note.id}/edit`);
  await expect(page.getByTestId('app-not-found')).toBeVisible();
  await expect(page.getByTestId('note-form-title')).toHaveCount(0);

  await page.goto('/notes');
  await expect(page.getByTestId('notes-empty')).toBeVisible();
  await expect(page.getByTestId(`notes-row-${note.id}`)).toHaveCount(0);
});

test('an empty title shows the validation error on the form', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  await signInWithToken(page, lena.token);

  await page.goto('/notes/new');
  await expect(page.getByTestId('note-form-error')).toHaveCount(0);
  await page.getByTestId('note-form-body').fill('No title yet');
  await page.getByTestId('note-form-submit').click();
  await expect(page.getByTestId('note-form-error')).toHaveAttribute('data-error-code', 'VALIDATION_FAILED');
  await expect(page).toHaveURL(/\/notes\/new$/);

  await page.getByTestId('note-form-title').fill('Ideas');
  await page.getByTestId('note-form-tags').fill('ok, road map');
  await page.getByTestId('note-form-submit').click();
  await expect(page.getByTestId('note-form-error')).toHaveAttribute('data-error-code', 'VALIDATION_FAILED');
  await expect(page).toHaveURL(/\/notes\/new$/);
});
