import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Accessibility gate (web-testing.md): axe on the key shell surfaces, light and dark.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('home shell has no accessibility violations (light theme)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'McDermott' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('home shell has no accessibility violations (dark theme)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
