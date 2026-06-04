export type ModelShortId =
  | 'openai'
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'google_aio';

export type ModelFilter = ModelShortId | 'all';

export type DomainType =
  | 'You'
  | 'Competitor'
  | 'UGC'
  | 'Editorial'
  | 'Reference'
  | 'Institutional'
  | 'Corporate'
  | 'Other';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export type PromptTopic =
  | 'Category'
  | 'Competitor'
  | 'Affiliate'
  | 'Core'
  | 'Free tool'
  | string;

export interface Brand {
  id: string;
  name: string;
  domain: string;
  isPrimary?: boolean;
  category: string | null;
  description: string | null;
  createdAt?: string;
}

export interface Competitor {
  id?: string;
  name: string;
  domain: string;
  brandId?: string;
  createdAt?: string;
}

export interface Prompt {
  id: string;
  text: string;
  topic: string;
  tags?: string[];
  isActive: boolean;
  brandId?: string;
  createdAt?: string;
}

export interface Run {
  id: string;
  promptId: string;
  model: ModelShortId;
  response: string | null;
  mentioned: boolean;
  positionScore: number | null;
  sentiment: Sentiment;
  competitorMentions: Record<string, boolean>;
  estimatedCost: number | null;
  createdAt: string;
}

export interface Citation {
  id?: string;
  runId: string;
  domain: string;
  url: string | null;
  domainType: DomainType;
  createdAt?: string;
}

export interface CrawlPage {
  path: string;
  text: string;
}

export interface CrawlPages {
  url: string;
  pages: CrawlPage[];
}

export interface CrawlResult {
  title: string;
  description: string;
  category: string;
  targetAudience: string;
  coreUseCase: string;
  features: string[];
  integrations: string[];
  pricingInfo?: string;
  competitorHints: string[];
}

export interface OverviewMetrics {
  visibility: number;
  visibilityChange: number | null;
  mentioned: number;
  totalRuns: number;
  avgSentiment: number | null;
  avgPosition: number | null;
  sov: number;
  competitiveRank: number;
  totalCitations: number;
}

export interface RankingsRow {
  name: string;
  isYou: boolean;
  visibility: number;
  sov: number;
  sentiment: number | null;
  position: number | null;
  visibilityChange: number | null;
}

export interface TrendRow {
  date: string;
  brand: number;
  [entityName: string]: number | string;
}

export interface SourceRow {
  domain: string;
  url?: string;
  type: DomainType;
  retrievalRate: number;
  citationRate: number;
}

export interface DomainTypeBreakdownRow {
  type: DomainType;
  count: number;
  percentage: number;
}

export interface RecentChatRow {
  promptId: string;
  text: string;
  models: ModelShortId[];
  citationCount: number;
  sentiment: { label: Sentiment; score: number | null };
  position: number | null;
  date: string;
}

export interface ActionCard {
  side: 'earned' | 'owned';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

export interface OverviewResponse {
  brand: Pick<Brand, 'id' | 'name' | 'domain' | 'category' | 'description'>;
  competitors: { name: string; domain: string }[];
  metrics: OverviewMetrics;
  rankings: RankingsRow[];
  trend: TrendRow[];
  sources: SourceRow[];
  domainTypes: DomainTypeBreakdownRow[];
  recentChats: RecentChatRow[];
  lastUpdated: string | null;
  keyInsight: string;
  actions: ActionCard[];
}

export type SourcesView = 'domains' | 'urls';

export interface SourcesResponse {
  sources: SourceRow[];
  domainTypes: DomainTypeBreakdownRow[];
  trend: TrendRow[];
  view: SourcesView;
}

export interface PromptMetricsRow {
  id: string;
  text: string;
  topic: string;
  visibility: number;
  sentiment: number | null;
  position: number | null;
  models: ModelShortId[];
  activeRunCount: number;
}

export interface PromptsMetricsResponse {
  prompts: PromptMetricsRow[];
}

export interface ModelBreakdownRow {
  model: ModelShortId;
  mentioned: boolean | null;
  position: number | null;
  sentiment: Sentiment | null;
  citationCount: number;
  /** First 300 chars of the latest response — shown collapsed by default. */
  latestResponsePreview: string;
  /** The complete latest response — revealed via "See more". */
  latestResponseFull: string;
}

export interface PromptDetailCitation {
  domain: string;
  url: string | null;
  type: DomainType;
  runId: string;
}

export interface PromptDetailResponse {
  prompt: Pick<Prompt, 'id' | 'text' | 'topic' | 'isActive'>;
  runs: Run[];
  citations: PromptDetailCitation[];
  modelBreakdown: ModelBreakdownRow[];
}

export interface BrandResponse {
  brand: Pick<Brand, 'id' | 'name' | 'domain' | 'category' | 'description'> | null;
}

export interface SetupDbTableStatus {
  table: 'brands' | 'competitors' | 'prompts' | 'runs' | 'citations';
  exists: boolean;
}

export interface SetupDbResponse {
  allTablesExist: boolean;
  results: SetupDbTableStatus[];
}

export interface CreatePromptBody {
  text: string;
  topic: string;
}

export interface CreatePromptResponse {
  id: string;
}

export interface DeletePromptBody {
  id: string;
}

export interface OkResponse {
  ok: true;
}

export interface RunPromptBody {
  promptId?: string;
}

export interface RunBatchModelResult {
  model: ModelShortId;
  success: boolean;
  runId?: string;
  error?: string;
}

export interface RunBatchPromptResult {
  promptId: string;
  models: RunBatchModelResult[];
}

export interface BatchResult {
  batchId: string;
  results: RunBatchPromptResult[];
  totalRuns: number;
  totalErrors: number;
  runTotalCost: number;
}

export interface CronRunResponse {
  ok: true;
  batchId: string;
  totalRuns: number;
  totalErrors: number;
}

export interface OnboardingCrawlBody {
  url: string;
}

export interface OnboardingCrawlResponse {
  crawlData: CrawlResult;
  domain: string;
}

export interface OnboardingGeneratePromptsBody {
  crawlData: CrawlResult;
  domain: string;
}

export interface OnboardingGeneratePromptsResponse {
  prompts: { text: string; topic: PromptTopic }[];
}

export interface OnboardingGenerateCompetitorsBody {
  crawlData: CrawlResult;
  domain: string;
}

export interface OnboardingGenerateCompetitorsResponse {
  competitors: { name: string; domain: string }[];
}

export interface OnboardingCompleteBody {
  brandName: string;
  domain: string;
  category: string;
  description: string;
  prompts: { text: string; topic: string }[];
  competitors: { name: string; domain: string }[];
}

export interface OnboardingCompleteResponse {
  brandId: string;
}
