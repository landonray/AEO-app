import { test, expect, type Page, type Route } from '@playwright/test';

// The "See more" affordance on the prompt detail modal lets the user expand a
// model's response from the 300-char preview to the full captured text.
//
// The /dashboard/prompts page is server-rendered and only renders when a
// primary brand exists in the DB (otherwise it redirects to onboarding). The
// dev DB already has a primary brand, so we let the page render and mock only
// the two CLIENT-side fetches the Prompts tab makes:
//   - GET /api/prompts/metrics  -> the prompt table rows
//   - GET /api/prompts/[id]     -> the per-model breakdown shown in the modal
// No database writes happen here.

const PROMPT_ID = 'p-seemore-e2e';
const PROMPT_TEXT = 'top alternatives to HubSpot for integrated marketing and sales';

// A response long enough to be truncated. The first 300 chars (the preview)
// contain only padding; the distinctive tail marker lives PAST char 300, so it
// can only be on screen once the full text is revealed.
const PREVIEW = 'A'.repeat(300);
const TAIL_MARKER = 'UNIQUE_TAIL_MARKER_XYZ_only_in_full_response';
const FULL = `${PREVIEW}\n\n${TAIL_MARKER} — and several more paragraphs of detail.`;

async function mockPromptsApi(page: Page) {
  await page.route('**/api/prompts/metrics**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prompts: [
          {
            id: PROMPT_ID,
            text: PROMPT_TEXT,
            topic: 'Competitor',
            visibility: 0.4,
            sentiment: 55,
            position: 5,
            models: ['perplexity'],
            activeRunCount: 1,
          },
        ],
      }),
    });
  });

  await page.route(`**/api/prompts/${PROMPT_ID}**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prompt: { id: PROMPT_ID, text: PROMPT_TEXT, topic: 'Competitor', isActive: true },
        runs: [],
        citations: [],
        modelBreakdown: [
          { model: 'openai', mentioned: null, position: null, sentiment: null, citationCount: 0, latestResponsePreview: '', latestResponseFull: '' },
          { model: 'claude', mentioned: null, position: null, sentiment: null, citationCount: 0, latestResponsePreview: '', latestResponseFull: '' },
          { model: 'gemini', mentioned: null, position: null, sentiment: null, citationCount: 0, latestResponsePreview: '', latestResponseFull: '' },
          {
            model: 'perplexity',
            mentioned: true,
            position: 5,
            sentiment: 'positive',
            citationCount: 7,
            latestResponsePreview: PREVIEW,
            latestResponseFull: FULL,
          },
          { model: 'google_aio', mentioned: null, position: null, sentiment: null, citationCount: 0, latestResponsePreview: '', latestResponseFull: '' },
        ],
      }),
    });
  });
}

test.describe('Prompt detail — "See more" reveals the full response', () => {
  test('expands the truncated preview to the full text and collapses again', async ({ page }) => {
    await mockPromptsApi(page);

    await page.goto('/dashboard/prompts', { waitUntil: 'domcontentloaded' });

    // Open the prompt detail modal by clicking the prompt row.
    const row = page.getByTestId('prompt-row').filter({ hasText: PROMPT_TEXT });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: PROMPT_TEXT }).click();

    // Expand the Perplexity model card (it's the one with a captured response).
    const card = page.getByTestId('model-card-perplexity');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole('button').first().click();

    // Collapsed-by-default state: preview shown, full tail hidden, "See more" offered.
    const seeMore = page.getByRole('button', { name: 'See more' });
    await expect(seeMore).toBeVisible();
    await expect(page.getByText(TAIL_MARKER)).toHaveCount(0);
    await expect(card).toContainText('Latest response preview');

    // Click "See more" — the full response (including the tail marker) appears.
    await seeMore.click();
    await expect(page.getByText(TAIL_MARKER)).toBeVisible();
    const seeLess = page.getByRole('button', { name: 'See less' });
    await expect(seeLess).toBeVisible();
    // The label drops the "preview" qualifier once the full response is shown.
    await expect(card).not.toContainText('Latest response preview');

    // Click "See less" — collapses back to the preview, tail hidden again.
    await seeLess.click();
    await expect(page.getByText(TAIL_MARKER)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'See more' })).toBeVisible();
  });
});
