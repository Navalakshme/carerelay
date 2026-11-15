import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function checkA11y(page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
}
async function ownerPage(page, context) {
  await context.addCookies([
    { name: 'care-test-role', value: 'owner', url: 'http://127.0.0.1:4174' },
  ]);
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  if (await page.getByLabel('Circle name', { exact: true }).isVisible()) {
    await page.getByLabel('Circle name', { exact: true }).fill('Accessibility circle');
    await page.getByRole('button', { name: 'Create private circle', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Today, together', exact: true })).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}
test('keyboard skip link and all anonymous account screens have accessible landmarks', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await checkA11y(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await checkA11y(page);
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await checkA11y(page);
});
test('all care pages and the proposal dialog pass axe; Escape restores focus', async ({
  page,
  context,
}) => {
  await ownerPage(page, context);
  for (const label of [
    'Overview',
    'Medication plan',
    'Care circle',
    'Care history',
    'Visit brief',
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#main h1')).toBeFocused();
    await checkA11y(page);
  }
  await page.getByRole('button', { name: 'Medication plan', exact: true }).click();
  await page.getByRole('button', { name: 'Propose a plan', exact: true }).click();
  await expect(page.getByLabel('Prescription / medication label', { exact: true })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-describedby', 'modal-description');
  await checkA11y(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Propose a plan', exact: true })).toBeFocused();
});
test('200 percent text sizing and 320px reflow preserve reading and touch targets', async ({
  page,
  context,
}) => {
  await ownerPage(page, context);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  for (const label of [
    'Overview',
    'Medication plan',
    'Care circle',
    'Care history',
    'Visit brief',
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const undersized = await page
      .locator('button:visible')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.getBoundingClientRect().height < 43)
          .map((node) => node.textContent),
      );
    expect(undersized).toEqual([]);
  }
  await checkA11y(page);
});
test('API errors move focus to an announced summary, while pending requests keep content readable', async ({
  page,
  context,
}) => {
  await ownerPage(page, context);
  await page.getByRole('button', { name: 'Visit brief', exact: true }).click();
  await page.getByRole('button', { name: 'Add a question', exact: true }).click();
  await page.getByLabel('Question', { exact: true }).fill('Review the timing');
  let finish;
  const gate = new Promise((resolve) => (finish = resolve));
  await page.route('**/api/care', async (route) => {
    if (route.request().method() === 'POST') {
      await gate;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service temporarily unavailable. Please try again.' }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save question', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'true');
  expect(await page.locator('#app').getAttribute('inert')).toBe(null);
  finish();
  await expect(page.locator('#modal-error')).toBeFocused();
  await expect(page.locator('#modal-error')).toContainText('Service temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Save question', exact: true })).toBeEnabled();
  await checkA11y(page);
});
