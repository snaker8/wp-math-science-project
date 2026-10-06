import { describe, it, expect } from 'vitest';
import { normalizeClaudeBody, usesAdaptiveThinking, effortFromBudget, CLAUDE_MODELS } from './model-params';
import { normalizeOpenAIBody, isReasoningModel, OPENAI_MODELS } from '../openai/model-params';

// 2026-10-06 실측(/v1/messages): 5.x 는 enabled thinking·temperature 거부, adaptive+effort 만 받는다
describe('normalizeClaudeBody', () => {
  it('★ 5.5 + 종전 enabled thinking → adaptive + effort, temperature 제거', () => {
    const b: Record<string, unknown> = normalizeClaudeBody({ model: CLAUDE_MODELS.SONNET, max_tokens: 12000, thinking: { type: 'enabled', budget_tokens: 8000 }, temperature: 1, messages: [] });
    expect(b.thinking).toEqual({ type: 'adaptive' });
    expect(b.output_config).toEqual({ effort: 'high' });
    expect('temperature' in b).toBe(false);
  });
  it('5.5 + temperature 만 → temperature 제거, thinking 없음', () => {
    const b: Record<string, unknown> = normalizeClaudeBody({ model: 'claude-opus-5-5', max_tokens: 4000, temperature: 0.2, messages: [] });
    expect('temperature' in b).toBe(false);
    expect('thinking' in b).toBe(false);
  });
  it('effort 지정이 budget 환산보다 우선', () => {
    const b: Record<string, unknown> = normalizeClaudeBody({ model: CLAUDE_MODELS.SONNET, max_tokens: 9000, thinking: { type: 'enabled', budget_tokens: 1000 }, messages: [] }, { effort: 'high' });
    expect(b.output_config).toEqual({ effort: 'high' });
  });
  it('4.6 은 그대로 (enabled + temperature 1)', () => {
    const b: Record<string, unknown> = normalizeClaudeBody({ model: 'claude-sonnet-4-6', max_tokens: 6000, thinking: { type: 'enabled', budget_tokens: 3000 }, temperature: 1, messages: [] });
    expect(b.thinking).toEqual({ type: 'enabled', budget_tokens: 3000 });
    expect(b.temperature).toBe(1);
  });
  it('4.7 (sampling 미허용) 은 temperature 만 제거', () => {
    const b: Record<string, unknown> = normalizeClaudeBody({ model: 'claude-opus-4-7', max_tokens: 4000, temperature: 0.2, messages: [] });
    expect('temperature' in b).toBe(false);
  });
  it('usesAdaptiveThinking / effortFromBudget', () => {
    expect(usesAdaptiveThinking('claude-sonnet-5-5')).toBe(true);
    expect(usesAdaptiveThinking('claude-sonnet-5')).toBe(true);
    expect(usesAdaptiveThinking('claude-fable-5-1')).toBe(true);
    expect(usesAdaptiveThinking('claude-sonnet-4-6')).toBe(false);
    expect(usesAdaptiveThinking('claude-haiku-4-5')).toBe(false);
    expect(effortFromBudget(2000)).toBe('low'); expect(effortFromBudget(4000)).toBe('medium'); expect(effortFromBudget(8000)).toBe('high');
  });
});

// 2026-10-06 실측(/v1/chat/completions): gpt-5.x 는 max_tokens 거부(max_completion_tokens), temperature≠1 거부
describe('normalizeOpenAIBody', () => {
  it('★ gpt-5.5: max_tokens → max_completion_tokens, temperature 0.2 제거, response_format 유지', () => {
    const b: Record<string, unknown> = normalizeOpenAIBody({ model: OPENAI_MODELS.MAIN, messages: [], temperature: 0.2, max_tokens: 4000, response_format: { type: 'json_object' } });
    expect(b.max_completion_tokens).toBe(16000); // 4000×4 (추론 토큰 여유, 상한 16000)
    expect(b.reasoning_effort).toBe('low');
    expect('max_tokens' in b).toBe(false);
    expect('temperature' in b).toBe(false);
    expect(b.response_format).toEqual({ type: 'json_object' });
  });
  it('gpt-4o 는 그대로', () => {
    const b: Record<string, unknown> = normalizeOpenAIBody({ model: 'gpt-4o', messages: [], temperature: 0.2, max_tokens: 100 });
    expect(b.max_tokens).toBe(100); expect(b.temperature).toBe(0.2);
  });
  it('isReasoningModel', () => {
    expect(isReasoningModel('gpt-5.4-mini')).toBe(true); expect(isReasoningModel('o3')).toBe(true); expect(isReasoningModel('gpt-4.1-mini')).toBe(false);
  });
});
