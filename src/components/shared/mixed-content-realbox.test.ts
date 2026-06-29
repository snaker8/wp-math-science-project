import { describe, it, expect } from 'vitest';
import katex from 'katex';
// ★ 복제가 아니라 실제 배포되는 함수를 직접 호출 — replica drift(복원 정규식 \d→d) 재발 방지.
import { convertChoiceTabularBox } from './box-conversion';

const CTRL1 = String.fromCharCode(1);

describe('convertChoiceTabularBox (실제 함수) — 동인고 #16 행렬 보존·복원', () => {
  // 실제 parseHml 결과 형태
  const box = '\\begin{tabular}{|c|}\\hline (가) 양수 $k$에 대하여 $A \\left( \\begin{matrix}1 & 2 \\\\ -1 & 1\\end{matrix} \\right)= \\left( \\begin{matrix}0 & k \\\\ 0 & 2k\\end{matrix} \\right)$ \\\\ \\hline (나) $B \\left( \\begin{matrix}1 \\\\ -1\\end{matrix} \\right)= \\left( \\begin{matrix}0 \\\\ 0\\end{matrix} \\right)$이다. \\\\ \\hline (다) $A B =4A$이고, $B A =6B$이다. \\\\ \\hline\\end{tabular}';
  const out = convertChoiceTabularBox(box);

  it('★★ 제어문자(MTX) 플레이스홀더가 복원돼 새어나오지 않음', () => {
    expect(out).not.toContain(CTRL1);
  });
  it('★★ 행렬 \\begin{matrix} + 열(&)·행(\\\\) 보존', () => {
    expect(out).toContain('\\begin{matrix}');
    expect(out).toContain('1 & 2');
    expect(out).toContain('1 \\\\ -1');
  });
  it('★ (가)(나)(다) 라벨 보존', () => {
    expect(out).toContain('(가)');
    expect(out).toContain('(나)');
    expect(out).toContain('(다)');
  });
  it('★ \\hline raw 미노출', () => {
    expect(out).not.toContain('hline');
  });
  it('★★ 각 조건의 $...$ 가 실제 KaTeX 로 렌더됨(에러 없음)', () => {
    const segs = out.match(/\$[^$]*\$/g) || [];
    expect(segs.length).toBeGreaterThan(0);
    for (const seg of segs) {
      const latex = seg.replace(/^\$|\$$/g, '');
      if (!latex.trim()) continue;
      expect(() => katex.renderToString(latex, { throwOnError: true })).not.toThrow();
    }
  });
});
