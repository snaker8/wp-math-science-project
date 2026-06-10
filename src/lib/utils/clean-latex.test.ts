// ============================================================================
// clean-latex 회귀 테스트 — CLAUDE.md 안전 가드 #2(배점)·렌더링 사고의 코드화
//   - [총 N점]·[N점]·(N점) 본문 strip (신도중 [서·논술형 4] 사고)
//   - 소문제 배점 인라인 주입 3분기 + [서답형 N] false positive 차단 (사직여중)
//   - 행렬 array 보존 (BS_H1S1_R2 #39 사고)
// ============================================================================
import { describe, it, expect } from 'vitest';
import { cleanLatexContent, injectSubQuestionPoints, cleanChoiceText } from './clean-latex';

describe('cleanLatexContent — 배점 표기 strip', () => {
  it('★ [총 N점] 과 [N점] 모두 제거 (총 표기 누락 시 배점 오인 사고)', () => {
    const out = cleanLatexContent('[총 5점] 다음을 구하시오. 5-1. 풀이 [2점]');
    expect(out).not.toContain('[총 5점]');
    expect(out).not.toContain('[2점]');
  });

  it('소괄호 (3점)·소수점 (3.4점) 도 제거', () => {
    const out = cleanLatexContent('다음을 계산하시오. (3.4점)');
    expect(out).not.toContain('3.4점');
  });

  it('수식 내 일반 대괄호는 보존', () => {
    const out = cleanLatexContent('구간 $[1, 5]$ 에서 최댓값을 구하시오.');
    expect(out).toContain('[1, 5]');
  });
});

describe('cleanLatexContent — LaTeX 정규화', () => {
  it('\\[..\\] display math → $$..$$', () => {
    expect(cleanLatexContent('\\[x^2+1\\]')).toBe('$$x^2+1$$');
  });

  it('\\displaystyle 제거 + \\lbrace → \\left\\{', () => {
    const out = cleanLatexContent('$\\displaystyle \\lbrace x \\rbrace$');
    expect(out).not.toContain('\\displaystyle');
    expect(out).toContain('\\left\\{');
    expect(out).toContain('\\right\\}');
  });

  it('마크다운 이미지 → [도형] 마커', () => {
    expect(cleanLatexContent('![fig](https://x/y.png) 그림을 보고')).toContain('[도형]');
  });

  it('leading 문제 번호 "01. " strip, 자연어 "1차 함수"는 보존', () => {
    expect(cleanLatexContent('01. 다음을 구하시오')).toBe('다음을 구하시오');
    expect(cleanLatexContent('1차 함수의 그래프')).toBe('1차 함수의 그래프');
  });
});

describe('injectSubQuestionPoints — 소문제 배점 주입 (가드 #2 분기와 동일 매핑)', () => {
  it('분기 1: "N-M." 라인 끝에 [N점] 부착 (동백중 5-1./5-2.)', () => {
    const out = injectSubQuestionPoints('문제 본문\n5-1. 첫 소문제\n5-2. 둘째 소문제', [
      { number: '5-1', points: 3 },
      { number: '5-2', points: 4 },
    ]);
    expect(out).toContain('5-1. 첫 소문제 [3점]');
    expect(out).toContain('5-2. 둘째 소문제 [4점]');
  });

  it('분기 2: "[서·논술형 N-M]" 대괄호 직후 부착 (신도중)', () => {
    const out = injectSubQuestionPoints('[서·논술형 5-1] 다음을 구하시오', [
      { number: '5-1', points: 6 },
    ]);
    expect(out).toContain('[서·논술형 5-1] [6점]');
  });

  it('★ [서답형 N] 대문제 헤더에는 주입 금지 (사직여중 14·15번 사고)', () => {
    const src = '[서답형 1] 다음 물음에 답하시오.\n(1) 첫 물음';
    const out = injectSubQuestionPoints(src, [{ number: '1', points: 2 }]);
    expect(out).not.toContain('[서답형 1] [2점]');
  });

  it('이미 같은 [N점] 있으면 중복 주입 금지', () => {
    const src = '5-1. 첫 소문제 [3점]';
    const out = injectSubQuestionPoints(src, [{ number: '5-1', points: 3 }]);
    expect(out.match(/\[3점\]/g)?.length).toBe(1);
  });

  it('points null/비유한값은 skip', () => {
    const src = '5-1. 소문제';
    expect(injectSubQuestionPoints(src, [{ number: '5-1', points: null }])).toBe(src);
  });
});

describe('cleanChoiceText — 행렬 보존 가드', () => {
  it('★ 한글 없는 행렬 array 는 원본 유지 (BS_H1S1_R2 #39 사고)', () => {
    const matrix = '$\\left(\\begin{array}{lll}2 & 2 & 2 \\\\ 1 & 0 & 1\\end{array}\\right)$';
    expect(cleanChoiceText(matrix)).toBe(matrix);
  });

  it('한글 보기형 array 는 줄별 $...$ 로 변환', () => {
    const out = cleanChoiceText('\\begin{array}{l}ㄱ. 첫째 \\\\ ㄴ. 둘째\\end{array}');
    expect(out).toContain('$ㄱ. 첫째$');
    expect(out).toContain('$ㄴ. 둘째$');
  });

  it('$\\text{ㄱ, ㄴ}$ → 본문 폰트 (KaTeX wrapping 해제)', () => {
    expect(cleanChoiceText('$\\text{ㄱ, ㄴ}$')).toBe('ㄱ, ㄴ');
  });
});
