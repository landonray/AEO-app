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

// A markdown response long enough to be truncated. The preview leads with a
// **bold** span (so we can prove markdown is rendered, not shown raw); the
// distinctive tail marker lives only in the full text, inside a bold list item,
// so it can only appear once "See more" is clicked.
const BOLD_LEAD = 'Top alternatives to HubSpot';
const TAIL_MARKER = 'UNIQUE_TAIL_MARKER_only_in_full_response';
const PREVIEW =
  `**${BOLD_LEAD}** include Zoho, Salesforce, ActiveCampaign, Keap, and EngageBay — ` +
  'each strong on combined marketing and sales. '.repeat(4);
const FULL =
  `${PREVIEW}\n\n## Full breakdown\n\n` +
  `- **${TAIL_MARKER}** leads the list\n` +
  `- Salesforce for enterprise\n`;

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

    // Markdown is rendered, not shown raw: the bold lead is a <strong> element
    // and the literal ** asterisks are gone from the panel.
    await expect(card.locator('strong', { hasText: BOLD_LEAD })).toBeVisible();
    await expect(card).not.toContainText('**');

    // Click "See more" — the full response (including the tail marker) appears,
    // rendered as a bold bullet item rather than raw markdown.
    await seeMore.click();
    await expect(card.locator('li strong', { hasText: TAIL_MARKER })).toBeVisible();
    await expect(card.locator('ul li')).toHaveCount(2);
    await expect(card).not.toContainText('**');
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
