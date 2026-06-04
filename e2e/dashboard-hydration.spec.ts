import { test, expect, type ConsoleMessage } from '@playwright/test';

// Regression guard for the dashboard Header's "Last updated X ago" label.
//
// The label is computed from the current clock at render time. Because the
// server renders during SSR and the browser hydrates a moment later, the
// relative time can tick over between the two ("9 seconds ago" -> "10 seconds
// ago"), which used to throw a React hydration mismatch on every dashboard
// page. The fix tells React this one timestamp may differ and recomputes it on
// the client after mount.
//
// This test loads a server-rendered dashboard page and asserts the browser
// never logs a hydration error. We mock only the client-side fetches so no DB
// writes happen; the page itself still renders from the dev DB's primary brand.

const HYDRATION_SIGNATURES = [
  'Hydration failed',
  "didn't match",
  'did not match',
  'Text content does not match',
  'hydrated but some attributes',
];

function isHydrationError(text: string): boolean {
  return HYDRATION_SIGNATURES.some((sig) => text.includes(sig));
}

test.describe('Dashboard Header — clean hydration', () => {
  test('renders the "Last updated" label without a hydration mismatch', async ({ page }) => {
    const hydrationErrors: string[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' && isHydrationError(msg.text())) {
        hydrationErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      if (isHydrationError(err.message)) {
        hydrationErrors.push(err.message);
      }
    });

    // Keep the client-side fetches cheap and deterministic.
    await page.route('**/api/prompts/metrics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompts: [] }),
      });
    });

    await page.goto('/dashboard/prompts', { waitUntil: 'domcontentloaded' });

    // The header (and its timestamp) is part of the server-rendered shell.
    const lastUpdated = page.getByTestId('last-updated');
    await expect(lastUpdated).toBeVisible({ timeout: 30_000 });
    await expect(lastUpdated).toContainText('Last updated');

    // Give React time to finish hydrating and run the post-mount recompute.
    await page.waitForTimeout(1_500);

    expect(hydrationErrors, hydrationErrors.join('\n')).toHaveLength(0);
  });
});
