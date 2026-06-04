import { test, expect, type Page, type Route } from '@playwright/test';

interface MockState {
  brand: { id: string; name: string; domain: string; category: string | null; description: string | null } | null;
  crawl: { ok: true } | { ok: false; status: number; message: string };
  completeCalls: { body: unknown; status: number }[];
}

function freshState(): MockState {
  return {
    brand: null,
    crawl: { ok: true },
    completeCalls: [],
  };
}

async function setupMocks(page: Page, state: MockState) {
  await page.route('**/api/brand', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ brand: state.brand }),
    });
  });

  await page.route('**/api/onboarding/crawl', async (route: Route) => {
    if (!state.crawl.ok) {
      await route.fulfill({
        status: state.crawl.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: state.crawl.message }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        crawlData: {
          title: 'Acme Analytics',
          description: 'Analytics for SaaS teams.',
          category: 'SaaS analytics',
          targetAudience: 'Product managers at B2B SaaS companies',
          coreUseCase: 'Track product usage and retention.',
          features: ['dashboards', 'funnels'],
          integrations: ['Segment', 'Stripe'],
          competitorHints: ['Amplitude', 'Mixpanel'],
        },
        domain: 'acme.com',
      }),
    });
  });

  await page.route('**/api/onboarding/generate-prompts', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prompts: [
          { text: 'best product analytics for B2B SaaS', topic: 'Category' },
          { text: 'top alternatives to Mixpanel', topic: 'Competitor' },
          { text: 'Amplitude vs Mixpanel vs Heap', topic: 'Affiliate' },
          { text: 'how to track product retention', topic: 'Core' },
          { text: 'free tool for funnel analysis', topic: 'Free tool' },
        ],
      }),
    });
  });

  await page.route('**/api/onboarding/generate-competitors', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        competitors: [
          { name: 'Mixpanel', domain: 'mixpanel.com' },
          { name: 'Amplitude', domain: 'amplitude.com' },
          { name: 'Heap', domain: 'heap.io' },
          { name: 'PostHog', domain: 'posthog.com' },
        ],
      }),
    });
  });

  await page.route('**/api/onboarding/complete', async (route: Route) => {
    const reqBody = route.request().postDataJSON();
    state.completeCalls.push({ body: reqBody, status: 200 });
    state.brand = {
      id: 'brand-1',
      name: typeof (reqBody as { brandName?: string })?.brandName === 'string'
        ? (reqBody as { brandName: string }).brandName
        : 'Acme Analytics',
      domain: 'acme.com',
      category: 'SaaS analytics',
      description: 'Analytics for SaaS teams.',
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ brandId: 'brand-1' }),
    });
  });
}

async function reachStep3(page: Page, url = 'https://acme.com') {
  await page.goto('/');
  await expect(page.getByTestId('onboarding-step-1')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('onboarding-url-input').fill(url);
  await page.getByTestId('onboarding-url-submit').click();
  await expect(page.getByTestId('onboarding-step-3')).toBeVisible({ timeout: 30_000 });
}

test.describe('Onboarding UI — §9.7', () => {
  // First navigation on a fresh Next.js dev server triggers on-demand compile of
  // the `/` route and bundled assets, which can take >10s. We warm it up once so
  // the per-test assertions don't race with first-compile latency.
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await setupMocks(page, freshState());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page
      .getByTestId('onboarding-progress')
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => {
        /* warmup is best-effort — per-test assertions will surface real failures */
      });
    await ctx.close();
  });

  test('9.7.a Step indicator shows Website → Analyzing → Review & Launch', async ({ page }) => {
    const state = freshState();
    await setupMocks(page, state);
    await page.goto('/');
    const progress = page.getByTestId('onboarding-progress');
    await expect(progress).toBeVisible();
    await expect(progress).toContainText('Website');
    await expect(progress).toContainText('Analyzing');
    await expect(progress).toContainText('Review & Launch');
  });

  test('9.7.b Submit on Enter and arrow click both work', async ({ page }) => {
    // Enter key
    const state1 = freshState();
    await setupMocks(page, state1);
    await page.goto('/');
    await page.getByTestId('onboarding-url-input').fill('https://acme.com');
    await page.getByTestId('onboarding-url-input').press('Enter');
    await expect(page.getByTestId('onboarding-step-3')).toBeVisible({ timeout: 10_000 });

    // Arrow click — fresh page
    const state2 = freshState();
    const page2 = await page.context().newPage();
    await setupMocks(page2, state2);
    await page2.goto('/');
    await page2.getByTestId('onboarding-url-input').fill('https://acme.com');
    await page2.getByTestId('onboarding-url-submit').click();
    await expect(page2.getByTestId('onboarding-step-3')).toBeVisible({ timeout: 10_000 });
    await page2.close();
  });

  test('9.7.c Loading spinner shows during analyze and the UI does not freeze', async ({ page }) => {
    const state = freshState();
    await setupMocks(page, state);

    // Delay the crawl response so we can observe step 2
    await page.unroute('**/api/onboarding/crawl');
    await page.route('**/api/onboarding/crawl', async (route: Route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          crawlData: {
            title: 'Acme',
            description: 'desc',
            category: 'cat',
            targetAudience: 'audience',
            coreUseCase: 'use',
            features: [],
            integrations: [],
            competitorHints: [],
          },
          domain: 'acme.com',
        }),
      });
    });

    await page.goto('/');
    await page.getByTestId('onboarding-url-input').fill('https://acme.com');
    await page.getByTestId('onboarding-url-submit').click();
    // Step 2 with spinner should be visible
    const step2 = page.getByTestId('onboarding-step-2');
    await expect(step2).toBeVisible();
    await expect(step2).toContainText('Analyzing');
    await expect(step2.getByRole('status')).toBeVisible();

    // UI is responsive: the progress indicator should still be on screen and step changes follow
    await expect(page.getByTestId('onboarding-progress')).toBeVisible();
    await expect(page.getByTestId('onboarding-step-3')).toBeVisible({ timeout: 10_000 });
  });

  test('9.7.d Step 3 fields are inline-editable; X removes a prompt/competitor; order preserved', async ({ page }) => {
    const state = freshState();
    await setupMocks(page, state);
    await reachStep3(page);

    // Inline-edit the brand name
    await page.getByTestId('onboarding-brand-name').click();
    const nameInput = page.getByTestId('onboarding-brand-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Renamed Co');
    await nameInput.press('Enter');
    await expect(page.getByTestId('onboarding-brand-name')).toContainText('Renamed Co');

    // Snapshot prompt order
    const promptRows = page.getByTestId('onboarding-prompt-row');
    const initialPromptTexts = await promptRows.allInnerTexts();
    expect(initialPromptTexts.length).toBe(5);

    // Remove the 2nd prompt
    const removeButtons = page.locator('[data-testid^="onboarding-prompt-remove-"]');
    await removeButtons.nth(1).click();

    const afterPromptTexts = await page.getByTestId('onboarding-prompt-row').allInnerTexts();
    expect(afterPromptTexts.length).toBe(4);

    // Order preserved: index 0 unchanged, index 1 is now the prior index 2
    expect(afterPromptTexts[0]).toBe(initialPromptTexts[0]);
    expect(afterPromptTexts[1]).toBe(initialPromptTexts[2]);

    // Remove the 1st competitor
    const competitorRows = page.getByTestId('onboarding-competitor-row');
    const initialCompetitorTexts = await competitorRows.allInnerTexts();
    expect(initialCompetitorTexts.length).toBeGreaterThanOrEqual(4);
    await page.locator('[data-testid^="onboarding-competitor-remove-"]').first().click();
    const afterCompetitorTexts = await page.getByTestId('onboarding-competitor-row').allInnerTexts();
    expect(afterCompetitorTexts.length).toBe(initialCompetitorTexts.length - 1);
    expect(afterCompetitorTexts[0]).toBe(initialCompetitorTexts[1]);
  });

  test('9.7.e "Start Over" returns to Step 1 and discards crawl data', async ({ page }) => {
    const state = freshState();
    await setupMocks(page, state);
    await reachStep3(page);

    // Edit the brand name so we can check it gets discarded
    await page.getByTestId('onboarding-brand-name').click();
    await page.getByTestId('onboarding-brand-name-input').fill('Mutated Name');
    await page.getByTestId('onboarding-brand-name-input').press('Enter');

    await page.getByTestId('onboarding-start-over').click();
    await expect(page.getByTestId('onboarding-step-1')).toBeVisible();
    await expect(page.getByTestId('onboarding-url-input')).toHaveValue('');

    // Go through onboarding again — should rebuild from API, not show stale "Mutated Name"
    await page.getByTestId('onboarding-url-input').fill('https://acme.com');
    await page.getByTestId('onboarding-url-submit').click();
    await expect(page.getByTestId('onboarding-step-3')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('onboarding-brand-name')).toContainText('Acme Analytics');
    await expect(page.getByTestId('onboarding-brand-name')).not.toContainText('Mutated Name');
  });

  test('9.7.f "Launch Tracking" redirects to / showing dashboard', async ({ page }) => {
    const state = freshState();
    await setupMocks(page, state);
    await reachStep3(page);

    await page.getByTestId('onboarding-launch').click();

    // After completion, page.tsx will reload and /api/brand now returns the new brand
    await expect(page.getByTestId('dashboard-placeholder')).toBeVisible({ timeout: 10_000 });
    expect(state.completeCalls.length).toBe(1);
  });

  test('9.7.g No "+ Add" button exists on the prompts card (Q3/A12)', async ({ page }) => {
    const state = freshState();
    await setupMocks(page, state);
    await reachStep3(page);

    // No add button by accessible name
    await expect(page.getByRole('button', { name: /add prompt/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /\+ add/i })).toHaveCount(0);

    // And no element with an "add" testid scoped under prompts
    await expect(page.locator('[data-testid="onboarding-prompt-add"]')).toHaveCount(0);
  });
});
