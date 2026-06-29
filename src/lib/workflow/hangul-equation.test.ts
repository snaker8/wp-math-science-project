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

// 동인고 공수1 자산화에서 깨지던 패턴 (2026-06-30)
describe('hangulEquationToLatex — 순열·조합 / 짝없는 right (동인고)', () => {
  it('★ 순열 ₆Pᵣ — it 스타일토큰이 _ 앞에서도 제거(it_{6} 노출 금지) + 좌측첨자 {} 보강 (#1)', () => {
    const out = hangulEquationToLatex('it_{6}{ {P}}it_{r}');
    expect(out).not.toContain('it_');   // it 안 지워지면 it_{6} 로 노출되던 사고
    expect(out).toContain('{}_{6}');    // 베이스 없는 좌측첨자 정상화
    expect(out).toContain('P');
    expect(renders(out)).toBe(true);
  });

  it('★ 조합 ₙC₁+ₙC₂ — 연산자(+) 뒤 베이스없는 첨자도 {} 보강', () => {
    const out = hangulEquationToLatex('it_{n}{ {C}}it_{1}+ it_{n}{ {C}}it_{2}=36');
    expect(out).not.toContain('it_');
    expect(out).toContain('{}_{n}');
    expect(out).toContain('+{}_{n}');
    expect(renders(out)).toBe(true);
  });

  it('★★ 짝 없는 끝 right 제거 — KaTeX 불균형 에러 방지 (#15)', () => {
    const out = hangulEquationToLatex('f left ( 1 right )-g left ( -2 right ) right .');
    const leftN = (out.match(/\\left(?![A-Za-z])/g) || []).length;
    const rightN = (out.match(/\\right(?![A-Za-z])/g) || []).length;
    expect(rightN).toBe(leftN);                    // 균형
    expect(out).not.toMatch(/\\right\s*\.\s*$/);   // 끝 orphan \right . 제거됨
    expect(renders(out)).toBe(true);
  });

  it('★ 정상 첨자(베이스 있음)는 {} 안 붙임', () => {
    const out = hangulEquationToLatex('x_{5}+y^{2}');
    expect(out).not.toContain('{}_');
    expect(out).not.toContain('{}^');
    expect(renders(out)).toBe(true);
  });
});

// n제곱근 root/of, 명령에 붙은 스타일토큰 (전 코퍼스 551→348 감소분, 2026-06-30)
describe('hangulEquationToLatex — n제곱근(root/of) · 글루 스타일토큰', () => {
  it('★ root {n} of {x} → \\sqrt[n]{x}', () => {
    const out = hangulEquationToLatex('root {3} of {8}');
    expect(out).toContain('\\sqrt[3]{8}');
    expect(out).not.toMatch(/\\root|\\of(?![A-Za-z])/);
    expect(renders(out)).toBe(true);
  });
  it('★ root {x} (of 없음) → \\sqrt{x}', () => {
    const out = hangulEquationToLatex('i= root {-1}');
    expect(out).toContain('\\sqrt{-1}');
    expect(renders(out)).toBe(true);
  });
  it('★ bare root n of x (중괄호 없이도)', () => {
    const out = hangulEquationToLatex('3 root 3 of 2');
    expect(out).toContain('\\sqrt[3]{2}');
    expect(renders(out)).toBe(true);
  });
  it('★ \\root/\\of 미정의 명령이 안 남음 (KaTeX 렌더)', () => {
    expect(renders(hangulEquationToLatex('root5'))).toBe(true);
    expect(renders(hangulEquationToLatex('2 root 26'))).toBe(true);
  });
  it('★ itpile / itright — 명령에 붙은 it 제거', () => {
    expect(hangulEquationToLatex('left . x itpile { # } right')).not.toContain('itpile');
    const r = hangulEquationToLatex('a itright }');
    expect(r).not.toContain('itright');
  });

  it('★ 잘린 끝 {{: 아티팩트 제거 — 앞부분만 정상 렌더', () => {
    expect(hangulEquationToLatex('{x}{{:')).not.toContain('{{:');
    expect(renders(hangulEquationToLatex('{x}{{:'))).toBe(true);
    expect(renders(hangulEquationToLatex('{x ^{2} +x-1=0}{{:'))).toBe(true);
  });
});
