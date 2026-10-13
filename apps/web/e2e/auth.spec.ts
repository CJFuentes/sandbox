import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const TOKEN_KEY = 'auth.token';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

/** Registers a user through the API (via the web server's /api proxy) and returns its token. */
async function registerViaApi(request: APIRequestContext, name = 'Api User') {
  const email = uniqueEmail('e2e');
  const password = 'correct-horse-battery';
  const response = await request.post('/api/v1/auth/register', { data: { email, password, name } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { token: string };
  return { email, password, name, token: body.token };
}

async function signInWithToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [TOKEN_KEY, token] as const,
  );
}

test('registers through the form, lands on home, signs out and back in', async ({ page }) => {
  const email = uniqueEmail('e2e-register');
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Grace Hopper');
  await page.getByTestId('register-email').fill(email);
  await page.getByTestId('register-password').fill('correct-horse-battery');
  await page.getByTestId('register-submit').click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-greeting')).toContainText('Grace Hopper');
  await expect(page.getByTestId('nav-user')).toContainText(email);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY)).toBeTruthy();

  await page.getByTestId('nav-logout').click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY)).toBeNull();

  await page.getByTestId('login-email').fill(email.toUpperCase());
  await page.getByTestId('login-password').fill('correct-horse-battery');
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-greeting')).toContainText('Grace Hopper');
  await expect(page.getByTestId('nav-home')).toBeVisible();
});

test('shows the API error code on the login form', async ({ page, request }) => {
  const user = await registerViaApi(request);
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill('wrong-password');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveAttribute('data-error-code', 'INVALID_CREDENTIALS');

  // Native constraint validation never blocks a submit: an empty form reaches the API.
  await page.getByTestId('login-email').fill('');
  await page.getByTestId('login-password').fill('');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveAttribute('data-error-code', 'VALIDATION_FAILED');
});

test('shows EMAIL_TAKEN and VALIDATION_FAILED on the register form', async ({ page, request }) => {
  const user = await registerViaApi(request);
  await page.goto('/register');
  await expect(page.getByTestId('register-error')).toHaveCount(0);
  await page.getByTestId('register-name').fill('Someone');
  await page.getByTestId('register-email').fill(user.email);
  await page.getByTestId('register-password').fill('another-password');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-error')).toHaveAttribute('data-error-code', 'EMAIL_TAKEN');

  await page.getByTestId('register-email').fill('not-an-email');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-error')).toHaveAttribute('data-error-code', 'VALIDATION_FAILED');
});

test('links between the login and register pages', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-register-link').click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByTestId('register-login-link').click();
  await expect(page).toHaveURL(/\/login$/);
});

test('redirects signed-out visits to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/some/deep/link?x=1');
  await expect(page).toHaveURL(/\/login$/);
});

test('a token in localStorage signs the page in; deep links and reloads work', async ({ page, request }) => {
  const user = await registerViaApi(request, 'Token User');
  await signInWithToken(page, user.token);

  await page.goto('/');
  await expect(page.getByTestId('home-greeting')).toContainText('Token User');

  await page.goto('/no/such/page');
  await expect(page.getByTestId('app-not-found')).toBeVisible();
  await expect(page.getByTestId('nav-user')).toContainText(user.email);
  await page.reload();
  await expect(page.getByTestId('app-not-found')).toBeVisible();

  await page.getByTestId('nav-home').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-greeting')).toBeVisible();
});

test('an invalid token is removed and the user goes to /login', async ({ page }) => {
  await signInWithToken(page, 'not-a-valid-token');
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY))
    .toBeNull();
});
