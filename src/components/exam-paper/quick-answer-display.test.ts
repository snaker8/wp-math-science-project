import { describe, it, expect } from 'vitest';
import { quickAnswerDisplay, balanceDollars } from './quick-answer-display';

describe('quickAnswerDisplay (학장중 24-2-2-M 빠른정답, 2026-09-22)', () => {
  it('★ `[4-1] ㄱ, ㄷ   [4-2] ㄴ, ㄹ` — 수식으로 안 감싸고 라벨마다 줄바꿈', () => {
    expect(quickAnswerDisplay('[4-1] ㄱ, ㄷ   [4-2] ㄴ, ㄹ')).toBe('[4-1] ㄱ, ㄷ\n[4-2] ㄴ, ㄹ');
  });
  it('★ 긴 한글 서술 소문항 답 — 그대로(수식 X), 라벨 줄바꿈', () => {
    const s = '[1-1] 삼각형 ABC의 세 변의 수직이등분선의 교점(외심)이 모닥불을 피울 위치이다. [1-2] 두 변의 수직이등분선을 작도하여 교점에 \'모닥불\' 표시.';
    const out = quickAnswerDisplay(s);
    expect(out.startsWith('$')).toBe(false);
    expect(out.split('\n').length).toBe(2);
  });
  it('★ 결론부 추출 뒤 고아 `$` 를 걷는다 — `34 cm$` 사고', () => {
    const s = '△ABE와 △DFC는 모두 이등변삼각형이고 두 쌍의 대변이 평행하므로 둘레 = $2 \\times (12 + 5) = 34\\text{ cm}$';
    const out = quickAnswerDisplay(s);
    expect((out.match(/\$/g) || []).length % 2).toBe(0);
    expect(out).toContain('34');
  });
  it('한글 없는 수식형 답은 종전대로 $ 로 감싼다', () => {
    expect(quickAnswerDisplay('x=5')).toBe('$x=5$');
    expect(quickAnswerDisplay('6x^5y^8')).toBe('$6x^5y^8$');
  });
  it('짧은 단답·이미 $ 있는 답은 그대로', () => {
    expect(quickAnswerDisplay('12')).toBe('12');
    expect(quickAnswerDisplay('$\\dfrac{15}{4}$ cm')).toBe('$\\dfrac{15}{4}$ cm');
  });
  it('balanceDollars', () => {
    expect(balanceDollars('34\\text{ cm}$')).toBe('34\\text{ cm}');
    expect(balanceDollars('$x=1')).toBe('x=1');
    expect(balanceDollars('$x=1$')).toBe('$x=1$');
  });
});
