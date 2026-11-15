import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { absorbCasesTrailingRemark } from './cases-trailing-remark';

const B = String.fromCharCode(92);
const t = (s: string) => s.replace(/@/g, B);
const renders = (out: string) => {
  const m = out.match(/\$\$([\s\S]*?)\$\$/);
  katex.renderToString(m![1], { throwOnError: true, displayMode: true });
};

describe('absorbCasesTrailingRemark', () => {
  it('해운대여고 #16 — 수식 안에서 연 괄호가 덧말에서 닫힌다', () => {
    const src = t('$$h @left(x @right)= @begin{cases}f(x) @@ g(-x)+k@end{cases} @left(k @right.$$는 상수$)$\n일 때');
    const out = absorbCasesTrailingRemark(src);
    expect(out).toContain(t('(k @text{는 상수})$$\n일 때'));
    expect(out).not.toContain(t('@right.'));
    renders(out);
  });
  it('덧말 전체가 괄호 한 덩이', () => {
    const out = absorbCasesTrailingRemark(t('$$f(x)=@begin{cases}1@@2@end{cases}$$ (단, $k$는 상수)'));
    expect(out).toContain(t('@quad @text{(단, }k@text{는 상수)}$$'));
    renders(out);
  });
  it('괄호 덧말이 아니면 그대로', () => {
    for (const s of ['$$@begin{cases}1@@2@end{cases}$$일 때, 값을 구하시오.', '$$@begin{cases}1@@2@end{cases}$$\n(단, k는 상수)', '$$@begin{cases}1@@2@end{cases}$$ (가) 조건 [도형]']) {
      expect(absorbCasesTrailingRemark(t(s))).toBe(t(s));
    }
  });
});
