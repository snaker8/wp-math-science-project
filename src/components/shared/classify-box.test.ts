import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { classifyTabularBlock, convertChoiceTabularBox } from './box-conversion';

const CTRL1 = String.fromCharCode(1);

// 부산중앙여고 #22 — (다) 조건에 열벡터 행렬(&없음). 실제 parseHml content 형태.
const BOX22 = '\\begin{tabular}{|c|}\\hline (가) 행렬 $A$, $B$는 $2 \\times 2$행렬이다. \\\\ \\hline (나) 행렬 $B$의 $\\left(i, j \\right)$성분 $b_{ij}$에 대하여$b_{11}=b_{12}=1$, $b_{21}=b_{22}$ \\\\ \\hline (다) $A B =3A$, $B A =2B$, $A \\left( \\begin{matrix}-1 \\\\ 1\\end{matrix} \\right)= \\left( \\begin{matrix}0 \\\\ 0\\end{matrix} \\right)$ \\\\ \\hline\\end{tabular}';
// 동인고 #16 — 2×2 행렬(&있음)
const BOX16 = '\\begin{tabular}{|c|}\\hline (가) $A \\left( \\begin{matrix}1 & 2 \\\\ -1 & 1\\end{matrix} \\right)$ \\\\ \\hline (나) $B$이다. \\\\ \\hline\\end{tabular}';
// 진짜 풀이박스 — nested aligned + boxed
const SOLBOX = '\\begin{array}{|l|}\\hline \\boxed{(가)} \\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned} \\\\ \\hline\\end{array}';

describe('classifyTabularBlock (실제 함수) — 행렬 조건박스 라우팅', () => {
  it('★★ #22 열벡터 행렬 조건박스 → isChoiceTabular (풀이박스 아님)', () => {
    const c = classifyTabularBlock(BOX22);
    expect(c.looksLikeSolutionBox).toBe(false);
    expect(c.isChoiceTabular).toBe(true);
  });
  it('★ #16 2×2 행렬 조건박스 → isChoiceTabular', () => {
    const c = classifyTabularBlock(BOX16);
    expect(c.isChoiceTabular).toBe(true);
  });
  it('★★ 진짜 풀이박스(aligned+boxed) → looksLikeSolutionBox (회귀 방지)', () => {
    const c = classifyTabularBlock(SOLBOX);
    expect(c.looksLikeSolutionBox).toBe(true);
    expect(c.isChoiceTabular).toBe(false);
  });
});

describe('#22 end-to-end — 행렬 보존 + KaTeX 렌더', () => {
  const out = convertChoiceTabularBox(BOX22);
  it('★★ 제어문자 누출 없음 + 행렬 열벡터 \\\\ 보존', () => {
    expect(out).not.toContain(CTRL1);
    expect(out).toContain('\\begin{matrix}');
    expect(out).toContain('-1 \\\\ 1');   // 열벡터 행구분 보존
  });
  it('★★ 각 $...$ KaTeX 렌더(에러 없음)', () => {
    for (const seg of (out.match(/\$[^$]*\$/g) || [])) {
      const l = seg.replace(/^\$|\$$/g, ''); if (!l.trim()) continue;
      expect(() => katex.renderToString(l, { throwOnError: true })).not.toThrow();
    }
  });
});
