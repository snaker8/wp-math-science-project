import { describe, it, expect } from 'vitest';
import { extractPoints } from './hml-save';
import { cleanLatexContent } from '@/lib/utils/clean-latex';

// 온천중 25-1-2-F #22 — (1)·(2) 마다 [4점]. 종전엔 합산 8만 남고 소문제 배점은 버려졌다.
const C22 = '다음은 교사와 학생의 대화이다. 물음에 답하시오.\n\\begin{tabular}{|c|}교사 : 몇 개일까요? \\\\ 학생 : $9$개입니다. \\\\ \\end{tabular}\n(1) (가)에 들어갈 수 있는 입체도형을 $4$가지 쓰시오. [4점]\n\n\n\n\n(2) (나)에 들어갈 말로 회전체의 성질을 $2$가지 서술하시오. [4점]';

describe('extractPoints — 소문제별 배점 보존 (HML 적재)', () => {
  it('★ (1)[4점] (2)[4점] → 총 8 + subPoints 1:4, 2:4, 본문 [N점] 제거', () => {
    const r = extractPoints(C22);
    expect(r.points).toBe(8);
    expect(r.subPoints).toEqual([{ number: '1', points: 4 }, { number: '2', points: 4 }]);
    expect(r.cleaned).not.toContain('점]');
  });
  it('[총 N점] 이 있으면 종전대로 총점만', () => {
    const r = extractPoints('[총 7점] 다음을 구하시오.\n(1) ㄱ [3점]\n(2) ㄴ [4점]');
    expect(r.points).toBe(7);
    expect(r.subPoints).toBeUndefined();
  });
  it('[N점] 이 하나뿐이면 subPoints 없음', () => {
    expect(extractPoints('구하시오. [5점]\n(1) ㄱ\n(2) ㄴ').subPoints).toBeUndefined();
  });
  it('마커 수와 [N점] 수가 다르면(소문제 하나에 배점 둘) 추측하지 않는다', () => {
    expect(extractPoints('(1) ㄱ [2점] [3점]\n(2) ㄴ').subPoints).toBeUndefined();
  });
});

describe('cleanLatexContent — 빈 줄 3개↑ 는 2개로 (답안 공간 빈 문단)', () => {
  it('★ (1)…\\n\\n\\n\\n\\n(2) → 빈 줄 하나', () => {
    const out = cleanLatexContent('(1) 쓰시오.\n\n\n\n\n(2) 서술하시오.');
    expect(out).toBe('(1) 쓰시오.\n\n(2) 서술하시오.');
  });
  it('빈 줄 하나·줄바꿈 하나는 그대로', () => {
    expect(cleanLatexContent('가\n\n나')).toBe('가\n\n나');
    expect(cleanLatexContent('가\n나')).toBe('가\n나');
  });
});
