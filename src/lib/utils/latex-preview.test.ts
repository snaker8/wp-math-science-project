import { describe, it, expect } from 'vitest';
import { truncateLatexPreview } from './latex-preview';

describe('truncateLatexPreview — 수식 한가운데서 끊지 않는다', () => {
  it('짧으면 그대로 (자르는 표시도 없다)', () => {
    expect(truncateLatexPreview('짧은 문제', 200)).toBe('짧은 문제');
  });

  // ★ 실사고 — 200번째 글자가 \begin{tabular} 한가운데라 "\begin{ta" 가 글자로 샜다
  it('토막 난 \\begin{ta 를 남기지 않는다', () => {
    const src = '가'.repeat(190) + '\\begin{tabular}{|c|}$a$의 부호 \\\\ \\end{tabular}';
    const out = truncateLatexPreview(src, 200);
    expect(out).not.toContain('\\begin');
    expect(out).not.toContain('{ta');
  });

  it('닫힌 \\begin…\\end 가 통째로 들어가면 그대로 둔다', () => {
    const src = '문제 \\begin{tabular}{|c|}$a$ \\end{tabular}' + '나'.repeat(300);
    const out = truncateLatexPreview(src, 200);
    expect(out).toContain('\\begin{tabular}');
    expect(out).toContain('\\end{tabular}');
  });

  it('$ 가 홀수로 끝나면 그 앞에서 끊는다', () => {
    const src = '다'.repeat(195) + '$x+1=2$ 뒤';
    const out = truncateLatexPreview(src, 199);
    expect(countDollar(out) % 2).toBe(0);
  });

  it('닫히지 않은 중괄호를 남기지 않는다', () => {
    const src = '라'.repeat(190) + '\\frac{12}{34} 끝';
    const out = truncateLatexPreview(src, 196);
    const open = (out.match(/(?<!\\)\{/g) || []).length;
    const close = (out.match(/(?<!\\)\}/g) || []).length;
    expect(open).toBe(close);
  });

  it('끝에 남은 명령어 토막을 버린다', () => {
    const src = '마'.repeat(198) + '\\displaystyle x';
    const out = truncateLatexPreview(src, 205);
    expect(out).not.toMatch(/\\[a-zA-Z]*$/);
  });

  it('빈 입력에도 안 터진다', () => {
    expect(truncateLatexPreview(null)).toBe('');
    expect(truncateLatexPreview(undefined)).toBe('');
    expect(truncateLatexPreview('')).toBe('');
  });
});

function countDollar(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) n++;
  }
  return n;
}
