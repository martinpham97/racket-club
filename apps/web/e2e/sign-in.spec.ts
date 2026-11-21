import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

/** Signed in as a student the API has never seen, so onboarding always starts fresh. */
async function asNewStudent(page: Page) {
  const id = `e2e-${randomUUID()}`;
  await page.addInitScript(
    (user) => {
      sessionStorage.setItem('rc.mockUser', JSON.stringify(user));
    },
    { id, email: `${id}@example.com`, roles: ['student'] },
  );
  await page.goto('/');
}

test('a new student fills in onboarding once, then lands on the home screen', async ({ page }) => {
  await asNewStudent(page);
  const form = page.getByTestId('onboarding');
  await expect(form).toBeVisible();

  // Sending it incomplete marks the missing fields.
  await form.getByLabel('Your name').fill('');
  await form.getByRole('button', { name: 'Save and continue' }).click();
  await expect(form.getByText('Please check this').first()).toBeVisible();

  await form.getByLabel('Your name').fill('Linh Nguyen');
  await form.getByLabel('Mobile number').fill('0412 345 678');
  await form.getByLabel('Your level').selectOption('improver');
  const emergency = form.getByRole('group', { name: 'Emergency contact' });
  await emergency.getByLabel('Name').fill('Minh Nguyen');
  await emergency.getByLabel('Phone').fill('0412 000 111');
  await form.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByRole('heading', { name: 'Hi Linh Nguyen' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('onboarding')).toHaveCount(0);
});

test('a junior must give a parent or guardian', async ({ page }) => {
  await asNewStudent(page);
  const form = page.getByTestId('onboarding');
  await form.getByLabel('Your name').fill('An Tran');
  await form.getByLabel('Mobile number').fill('0412 345 678');
  await form.getByLabel('Your level').selectOption('beginner');
  const emergency = form.getByRole('group', { name: 'Emergency contact' });
  await emergency.getByLabel('Name').fill('Bao Tran');
  await emergency.getByLabel('Phone').fill('0412 000 111');
  await form.getByLabel("I'm under 18").check();
  await form.getByRole('button', { name: 'Save and continue' }).click();

  const guardian = form.getByRole('group', { name: 'Parent or guardian' });
  await expect(guardian.getByText('Please check this')).toHaveCount(3);
  await guardian.getByLabel('Name').fill('Hoa Tran');
  await guardian.getByLabel('Phone').fill('0299 999 999');
  await guardian.getByLabel('Email').fill('hoa@example.com');
  await form.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Hi An Tran' })).toBeVisible();
});

test('the coach skips onboarding and finds the Google sign-in step', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /coach@example.com/ }).click();
  await expect(page.getByTestId('onboarding')).toHaveCount(0);
  const setup = page.getByTestId('google-setup');
  await expect(setup.getByRole('heading', { name: 'Google sign-in' })).toBeVisible();
  // There is no Cognito locally; the step explains that instead of failing.
  await expect(setup.getByText('once the app is running in your AWS account')).toBeVisible();
});
