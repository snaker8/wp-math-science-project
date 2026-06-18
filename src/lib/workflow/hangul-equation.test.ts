// 한글수식 → LaTeX 변환 회귀 (청운고 .hml 545 수식 점검에서 발견, 2026-06-19)
import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { hangulEquationToLatex } from './hangul-equation';

const renders = (latex: string) => {
  try { katex.renderToString(latex, { throwOnError: true }); return true; }
  catch { return false; }
};

describe('hangulEquationToLatex — 집합기호·폰트토큰', () => {
  it('left { / right } → \\left\\{ / \\right\\} (집합 중괄호)', () => {
    const out = hangulEquationToLatex('left {a_{n} right }');
    expect(out).toContain('\\left\\{');
    expect(out).toContain('\\right\\}');
    expect(renders(out)).toBe(true);
  });

  it('집합 조건제시법 중간 막대 left| → \\middle| (짝 없는 구분자 방지)', () => {
    const out = hangulEquationToLatex('left {x left| x in A` right }');
    expect(out).toContain('\\middle|');
    expect(out).not.toMatch(/\\left\\\{[\s\S]*\\left\|/); // 집합 안 left| 가 남으면 안 됨
    expect(renders(out)).toBe(true);
  });

  it('절댓값 left| ... right| 은 보존(\\middle| 로 바뀌지 않음)', () => {
    const out = hangulEquationToLatex('left| f left(x right) right|');
    expect(out).toContain('\\left|');
    expect(out).toContain('\\right|');
    expect(out).not.toContain('\\middle|');
    expect(renders(out)).toBe(true);
  });

  it('폰트 토큰 대문자(RM/IT) 제거', () => {
    const out = hangulEquationToLatex('RM 2km');
    expect(out).not.toMatch(/\bRM\b/);
    expect(out.replace(/\s/g, '')).toContain('2km');
  });

  it('조건제시법 right. (null 구분자) — KaTeX 렌더 성공', () => {
    const out = hangulEquationToLatex('left {x left| x right.');
    expect(renders(out)).toBe(true);
  });
});
