import { describe, expect, it } from 'vitest';
import { MODEL_META, MODEL_ORDER } from '../ModelIcon';

describe('ModelIcon metadata', () => {
  it('covers all five tracking models in the spec-mandated order', () => {
    expect(MODEL_ORDER).toEqual([
      'openai',
      'claude',
      'gemini',
      'perplexity',
      'google_aio',
    ]);
  });

  it('maps each model to the spec pill label', () => {
    expect(MODEL_META.openai.label).toBe('GPT');
    expect(MODEL_META.claude.label).toBe('CL');
    expect(MODEL_META.gemini.label).toBe('GM');
    expect(MODEL_META.perplexity.label).toBe('PX');
    expect(MODEL_META.google_aio.label).toBe('AIO');
  });

  it('maps each model to the spec §16 LLM brand color', () => {
    expect(MODEL_META.openai.color).toBe('#10a37f');
    expect(MODEL_META.claude.color).toBe('#d97640');
    expect(MODEL_META.gemini.color).toBe('#4285f4');
    expect(MODEL_META.perplexity.color).toBe('#20b2aa');
    expect(MODEL_META.google_aio.color).toBe('#ea4335');
  });

  it('provides a human display name for each model', () => {
    expect(MODEL_META.openai.displayName).toBe('ChatGPT');
    expect(MODEL_META.claude.displayName).toBe('Claude');
    expect(MODEL_META.gemini.displayName).toBe('Gemini');
    expect(MODEL_META.perplexity.displayName).toBe('Perplexity');
    expect(MODEL_META.google_aio.displayName).toBe('AI Overview');
  });

  it('has a meta entry for every model in MODEL_ORDER', () => {
    for (const id of MODEL_ORDER) {
      expect(MODEL_META[id]).toBeDefined();
      expect(MODEL_META[id].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(MODEL_META[id].label.length).toBeGreaterThan(0);
    }
  });
});
