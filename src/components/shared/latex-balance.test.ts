import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { balanceLeftRight, balanceLatex } from './latex-balance';

/** KaTeX 가 실제로 파싱되는지 — throwOnError:true 로 확인(운영은 false 라 조용히 빨개진다). */
function renders(latex: string): boolean {
  try {
    katex.renderToString(latex, { throwOnError: true, strict: false, trust: true });
    return true;
  } catch {
    return false;
  }
}

describe('balanceLeftRight', () => {
  it('짝 없는 \\left. 를 없애 렌더되게 한다 (여명중 25-2-1-F #18)', () => {
    const broken =
      String.raw`\begin{cases}x+2y=18 \\ 3ax-by=65\end{cases}\qquad \left.` +
      String.raw`\begin{cases}5x-ay=6 \\ 3x-5y= -23\end{cases}`;
    expect(renders(broken)).toBe(false);          // 지금 DB 에 있는 그대로면 깨진다
    expect(renders(balanceLeftRight(broken))).toBe(true);
  });

  it('짝 없는 \\right 를 없앤다 (동인고 #15 류)', () => {
    const broken = String.raw`x + 1 \right.`;
    expect(renders(broken)).toBe(false);
    expect(renders(balanceLeftRight(broken))).toBe(true);
  });

  it('짝이 맞으면 원본 그대로 (no-op) — 자동 크기 조절 보존', () => {
    const ok = String.raw`\left( \frac{1}{2} \right)`;
    expect(balanceLeftRight(ok)).toBe(ok);
    expect(renders(ok)).toBe(true);
  });

  it('\\leftarrow / \\rightarrow 는 건드리지 않는다', () => {
    const arrows = String.raw`a \rightarrow b \leftarrow c`;
    expect(balanceLeftRight(arrows)).toBe(arrows);
    expect(renders(arrows)).toBe(true);
  });

  it('여러 겹 중 안쪽만 짝이 없어도 렌더된다', () => {
    const broken = String.raw`\left[ \left\{ a + b \right]`;
    expect(renders(balanceLeftRight(broken))).toBe(true);
  });

  it('balanceLatex 는 중괄호 + left/right 를 함께 복구한다', () => {
    const broken = String.raw`\left. z_{1}} + 1`;
    expect(renders(broken)).toBe(false);
    expect(renders(balanceLatex(broken))).toBe(true);
  });

  it('\\left\\{ ... \\right. 집합 표기(짝 맞음)는 보존', () => {
    const ok = String.raw`\left\{ \begin{array}{l} x=1 \\ y=2 \end{array} \right.`;
    expect(balanceLeftRight(ok)).toBe(ok);
    expect(renders(ok)).toBe(true);
  });
});
