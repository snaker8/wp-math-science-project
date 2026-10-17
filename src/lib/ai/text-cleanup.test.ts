import { describe, it, expect } from 'vitest';
import { unescapeLiteralNewlines } from './text-cleanup';

const BS = String.fromCharCode(92);

describe('unescapeLiteralNewlines', () => {
  it('글자로 남은 백슬래시+n 을 줄바꿈으로', () => {
    expect(unescapeLiteralNewlines(`②는 참입니다.${BS}n${BS}n[3단계]`)).toBe('②는 참입니다.\n\n[3단계]');
  });
  it('LaTeX 명령(\\neq 등)은 보존', () => {
    expect(unescapeLiteralNewlines(`$a ${BS}neq b$ 이고${BS}n다음`)).toBe(`$a ${BS}neq b$ 이고\n다음`);
  });
  it('백슬래시 2개 + n 도 줄바꿈', () => {
    expect(unescapeLiteralNewlines(`a${BS}${BS}n${BS}${BS}nb`)).toBe('a\n\nb');
  });
  it('이미 정상인 텍스트는 그대로', () => {
    expect(unescapeLiteralNewlines('정상\n\n텍스트')).toBe('정상\n\n텍스트');
  });
});
