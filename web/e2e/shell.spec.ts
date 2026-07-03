import { expect, test } from '@playwright/test';

// End-to-end for slice 2 (Auth & app shell): a signed-in user lands on the sidebar shell and
// can toggle the theme, which survives a reload. Runs in dev mode (the SSO bypass) so no live
// Entra tenant is required; the shell renders even when the API is unavailable.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('the signed-in shell renders the identity lockup and navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'McDermott' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Requests' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account — Local Developer' })).toBeVisible();
});

test('the theme toggle persists across a reload', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');

  // Act — switch to dark.
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  // Assert — the choice survives a full reload (persisted to localStorage, applied pre-paint).
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('navigating to a section updates the shell', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Requests' }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
});
