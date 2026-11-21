import { expect, test } from '@playwright/test';

test('shows the default app name and theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app-name')).toHaveText('Racket Club');
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--rc-color-primary').trim(),
  );
  expect(primary).toBe('#1f5fbf');
});

test('switches to Vietnamese', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').selectOption('vi');
  await expect(page.getByText('Đặt lịch học cầu lông')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trang chủ' })).toBeVisible();
});

test('mock sign-in as the coach', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /coach@example.com/ }).click();
  await expect(page.getByText('coach@example.com (owner)')).toBeVisible();
});
