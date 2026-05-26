import { test, expect } from '@playwright/test';

test('auth page renders the sign-in form', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
});
