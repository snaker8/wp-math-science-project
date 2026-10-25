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

// 학평 25-09 고2 #20 — (가) 항목 안에 점화식 cases. parseHml 실제 출력(1칸 박스라 문단 사이 \hline 없음).
const BOX_CASES = '\\begin{tabular}{|c|}\\hline (가) 모든 자연수 $n$에 대하여 \\\\ $a_{n+1}= \\begin{cases}\\dfrac{a_{n}+3}{2} \\left(a_{n}이 홀수인 경우 \\right) \\\\ \\dfrac{3}{2}a_{n} \\left(a_{n}이 짝수인 경우 \\right)\\end{cases}$ \\\\ 이다. \\\\ (나) 모든 자연수 $n$에 대하여 $a_{n} \\le a_{3}$이다. \\\\ \\hline\\end{tabular}';

describe('classifyTabularBlock — 행 머리 (가)(나) 라벨 + cases (2026-10-25)', () => {
  it('★★ cases 가 든 (가)(나) 조건박스 → 풀이박스 아님, isChoiceTabular', () => {
    const c = classifyTabularBlock(BOX_CASES);
    expect(c.looksLikeSolutionBox).toBe(false);
    expect(c.isChoiceTabular).toBe(true);
  });
  it('★ 변환 결과에 cases 환경이 온전히 남고 \\hline 은 없다', () => {
    const out = convertChoiceTabularBox(BOX_CASES);
    expect(out).toContain('\\begin{cases}');
    expect(out).toContain('\\end{cases}');
    expect(out).not.toContain('hline');
    expect(out).not.toContain(CTRL1);
    expect(() => katex.renderToString(out.match(/\$([^$]*)\$/g)!.find((s) => s.includes('cases'))!.replace(/^\$|\$$/g, ''), { throwOnError: true })).not.toThrow();
  });
  it('(가) 라벨 없는 cases 1열 박스는 종전대로 풀이박스', () => {
    const c = classifyTabularBlock('\\begin{tabular}{|c|}\\hline $f(x)= \\begin{cases} 1 \\\\ 2 \\end{cases}$ \\\\ \\hline\\end{tabular}');
    expect(c.looksLikeSolutionBox).toBe(true);
  });
});

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
