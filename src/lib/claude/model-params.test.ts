import { describe, it, expect } from 'vitest';
import { acceptsSamplingParams, withSamplingParams } from './model-params';

// 회귀 테스트 — 2026-08-30: Opus 4.7+ 에 temperature 보내 400 나던 사고
describe('acceptsSamplingParams', () => {
  it.each([
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-opus-4-6',
    'claude-opus-4-5',
    'claude-opus-4-1',
    'claude-haiku-4-5',
    'claude-3-opus-20240229',
  ])('허용 모델을 통과시킨다 — %s', (model) => {
    expect(acceptsSamplingParams(model)).toBe(true);
  });

  it.each([
    'claude-opus-4-7',   // ★ 실제 사고 모델
    'claude-opus-4-8',
    'claude-opus-5',
    'claude-sonnet-5',
    'claude-fable-5',
  ])('제거된 모델을 막는다 — %s', (model) => {
    expect(acceptsSamplingParams(model)).toBe(false);
  });

  it('모르는 모델은 안전하게 false', () => {
    expect(acceptsSamplingParams('claude-future-9')).toBe(false);
    expect(acceptsSamplingParams('')).toBe(false);
    expect(acceptsSamplingParams(undefined)).toBe(false);
    expect(acceptsSamplingParams(null)).toBe(false);
  });

  it('접두사 오탐을 내지 않는다', () => {
    // 'claude-sonnet-4-6' 허용이 'claude-sonnet-4-60' 같은 별개 모델까지 통과시키면 안 된다
    expect(acceptsSamplingParams('claude-sonnet-4-60')).toBe(false);
    // 하이픈으로 이어지는 날짜 스냅샷은 같은 계열이므로 허용
    expect(acceptsSamplingParams('claude-sonnet-4-5-20250929')).toBe(true);
  });

  it('대소문자·공백에 흔들리지 않는다', () => {
    expect(acceptsSamplingParams('  Claude-Sonnet-4-6 ')).toBe(true);
    expect(acceptsSamplingParams('  Claude-Opus-4-7 ')).toBe(false);
  });
});

describe('withSamplingParams', () => {
  it('허용 모델에는 얹는다', () => {
    const body = withSamplingParams({ model: 'claude-sonnet-4-6' }, 'claude-sonnet-4-6', { temperature: 0.2 });
    expect(body).toHaveProperty('temperature', 0.2);
  });

  it('★ 핵심 회귀: 제거된 모델에는 얹지 않는다', () => {
    const body = withSamplingParams({ model: 'claude-opus-4-7' }, 'claude-opus-4-7', { temperature: 0.2 });
    expect(body).not.toHaveProperty('temperature');
  });

  it('top_p/top_k 도 같은 규칙을 따른다', () => {
    expect(withSamplingParams({}, 'claude-opus-4-7', { top_p: 0.9, top_k: 5 })).toEqual({});
    expect(withSamplingParams({}, 'claude-sonnet-4-6', { top_p: 0.9, top_k: 5 })).toEqual({ top_p: 0.9, top_k: 5 });
  });

  it('undefined 파라미터는 얹지 않는다', () => {
    expect(withSamplingParams({}, 'claude-sonnet-4-6', {})).toEqual({});
  });
});
