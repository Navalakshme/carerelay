import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const cookie = (role) => ({ name: 'care-test-role', value: role, url: 'http://127.0.0.1:4174' });
test('anonymous sign-in and recovery screens pass automated WCAG checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});
test('saved circle, approved plan, corrected ledger, recipient invite, viewer privacy and server-approved export', async ({
  browser,
}) => {
  const owner = await browser.newContext();
  await owner.addCookies([cookie('owner')]);
  const page = await owner.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  if (!(await page.getByLabel('Circle name').isVisible()))
    await page.getByRole('button', { name: 'Create another circle', exact: true }).click();
  await page.getByLabel('Circle name').fill('Browser care circle');
  await page.getByRole('button', { name: 'Create private circle' }).click();
  await expect(page.getByRole('heading', { name: 'Today, together' })).toBeVisible();
  await page.getByRole('button', { name: 'Medication plan', exact: true }).click();
  await page.getByRole('button', { name: 'Propose a plan', exact: true }).click();
  await page.getByLabel('Prescription / medication label').fill('Existing prescription');
  await page
    .getByLabel('Existing prescription instructions')
    .fill('Follow the clinician prescription label');
  const future = new Date(Date.now() + 86400000);
  await page
    .getByLabel('First date and time on your device')
    .fill(future.toISOString().slice(0, 16));
  await page.getByLabel('Number of daily occurrences').fill('2');
  await page.getByRole('button', { name: 'Send for elder review' }).click();
  await expect(page.getByText('No scheduled doses yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve proposal Existing prescription' }).click();
  await page.getByRole('button', { name: 'Approve plan', exact: true }).click();
  await expect(page.locator('.dose')).toHaveCount(2);
  await page.getByRole('button', { name: 'Report taken:', exact: false }).first().click();
  await page.getByRole('button', { name: 'Confirm report', exact: true }).click();
  await page.getByRole('button', { name: 'Correct outcome:', exact: false }).first().click();
  await page.getByLabel('Reason for correction').fill('The earlier report could not be confirmed');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.locator('.dose .badge.uncertain')).toHaveCount(1);
  await page.getByRole('button', { name: 'Care history', exact: true }).click();
  await expect(page.getByText(/corrected to uncertain/)).toBeVisible();
  await expect(page.getByText(/reported taken/)).toBeVisible();
  await page.getByRole('button', { name: 'Care circle', exact: true }).click();
  await page.getByRole('button', { name: 'Invite a person' }).click();
  await page.getByLabel('Recipient sign-in email').fill('browser-viewer@example.invalid');
  await page.getByLabel('Permission').selectOption('viewer');
  await page.getByRole('button', { name: 'Create 24-hour invitation' }).click();
  const code = await page.getByLabel('Invitation code', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const viewer = await browser.newContext();
  await viewer.addCookies([cookie('viewer')]);
  const viewerPage = await viewer.newPage();
  await viewerPage.goto('/');
  await viewerPage.getByRole('button', { name: 'Join a circle', exact: true }).click();
  await viewerPage.getByLabel('Invitation code').fill(code);
  await viewerPage.getByLabel('Your display name', { exact: true }).fill('Family viewer');
  await viewerPage.getByRole('button', { name: 'Join circle', exact: true }).click();
  await expect(viewerPage.getByRole('heading', { name: 'Shared daily summary' })).toBeVisible();
  await expect(viewerPage.getByText('Existing prescription', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Visit brief', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download approved brief' })).toBeDisabled();
  await page.getByRole('button', { name: 'Approve current brief' }).click();
  await expect(page.getByRole('button', { name: 'Download approved brief' })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download approved brief' }).click();
  expect((await download).suggestedFilename()).toBe('CareRelay-visit-brief.txt');
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByLabel('Question', { exact: true }).fill('Please review the uncertain outcome');
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByRole('button', { name: 'Download approved brief' })).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Medication plan', exact: true }).click();
  await page.getByRole('button', { name: 'Propose a plan', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).press('Escape');
  await expect(page.getByRole('button', { name: 'Propose a plan', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await owner.close();
  await viewer.close();
});
