import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { cleanHmlLeftovers, keepShortRhs, allowBreakAtCommas } from './render-polish';

describe('cleanHmlLeftovers', () => {
  it('센텀여고 #8 — 빈 행렬 버팀목을 걷어 내고 $ 짝이 맞는다', () => {
    const raw = String.raw`값은? $\left( \begin{matrix} \\ \end{matrix} \right.$단, $-\dfrac{21}{20} < k \le\dfrac{1}{5} \begin{matrix} \\ \end{matrix}$`;
    const r = cleanHmlLeftovers(raw);
    expect(r).not.toContain('matrix');
    expect(r).toContain(String.raw`$($단, $-\dfrac{21}{20} < k \le\dfrac{1}{5} $`);
    expect((r.match(/\$/g) || []).length % 2).toBe(0);
  });
  it('버팀목만 든 수식은 통째로 지운다 ($$ 가 남지 않는다)', () => {
    expect(cleanHmlLeftovers(String.raw`가 $\begin{matrix} \\ \end{matrix}$ 나`)).toBe('가  나');
  });
  it('내용 있는 행렬은 그대로', () => {
    const m = String.raw`$\left( \begin{matrix} 1 \\ 2 \end{matrix} \right)$`;
    expect(cleanHmlLeftovers(m)).toBe(m);
  });
  it('신도고 #8 — 수식 안 EMPTYSET', () => {
    expect(cleanHmlLeftovers(String.raw`② $A ^{C} \cap B = EMPTYSET$`)).toBe(String.raw`② $A ^{C} \cap B = \emptyset $`);
    expect(cleanHmlLeftovers('$P SMALLINTER Q= EMPTY SET$')).toBe(String.raw`$P \cap  Q= \emptyset $`);
    expect(cleanHmlLeftovers('수식 밖 EMPTYSET 은 그대로')).toBe('수식 밖 EMPTYSET 은 그대로');
  });
});

describe('keepShortRhs', () => {
  const long = String.raw`\left\{f \left(x \right)-x ^{2}+6x-3 \right\} \times \left\{f \left(x \right)+x ^{2}-8x+9 \right\}=0`;
  it('긴 식 끝 「=0」 앞에서 줄이 안 바뀐다', () => {
    const r = keepShortRhs(long);
    expect(r.endsWith(String.raw`=\nobreak 0`)).toBe(true);
    const bases = (s: string) => (katex.renderToString(s, { throwOnError: true }).match(/class="base"/g) || []).length;
    expect(bases(r)).toBe(bases(long) - 1);
  });
  it('짧은 식·우변이 긴 식은 그대로', () => {
    expect(keepShortRhs('x+1=0')).toBe('x+1=0');
    const s = String.raw`f \left(x \right)+g \left(x \right)+h \left(x \right)=x ^{2}+2x+1`;
    expect(keepShortRhs(s)).toBe(s);
  });
});

describe('allowBreakAtCommas', () => {
  it('집합 원소 사이에서 줄바꿈 가능', () => {
    const r = allowBreakAtCommas(String.raw`$\left\{-6,-5,-2,3,6,7 \right\}$`);
    expect(r).toBe(String.raw`$\{-6,\allowbreak -5,\allowbreak -2,\allowbreak 3,\allowbreak 6,\allowbreak 7 \}$`);
    expect(() => katex.renderToString(r.slice(1, -1), { throwOnError: true })).not.toThrow();
  });
  it('분수가 든 수식·중괄호 안 쉼표는 그대로', () => {
    expect(allowBreakAtCommas(String.raw`$\dfrac{1}{2}, 3$`)).toBe(String.raw`$\dfrac{1}{2}, 3$`);
    expect(allowBreakAtCommas('$a_{1,2}$')).toBe('$a_{1,2}$');
  });
});
