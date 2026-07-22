import { describe, it, expect } from 'vitest';
import { buildPreviewText } from './preview-text';

describe('buildPreviewText — 카드 액자용 첫 문제 요약', () => {
  it('평범한 문장은 그대로', () => {
    expect(buildPreviewText('다음 중 옳지 않은 것은?')).toBe('다음 중 옳지 않은 것은?');
  });

  it('수식은 뼈대를 걷고 기호만 남긴다', () => {
    expect(buildPreviewText('이차방정식 $x^{2}-4x+k=0$ 의 해를 구하시오.'))
      .toBe('이차방정식 x2-4x+k=0 의 해를 구하시오.');
  });

  it('표 블록은 통째로 제거 (닫히지 않아도)', () => {
    const s = '다음 표를 보고 답하시오. \\begin{tabular}{|c|}\\hline 학생 & A \\\\ \\hline\\end{tabular} 평균은?';
    const out = buildPreviewText(s);
    expect(out).toContain('다음 표를 보고 답하시오.');
    expect(out).toContain('평균은?');
    expect(out).not.toContain('tabular');
    expect(out).not.toContain('hline');
  });

  it('[도형] 마커와 배점 표기를 지운다', () => {
    expect(buildPreviewText('다음 그림과 같은 산점도는? [3점] [도형]'))
      .toBe('다음 그림과 같은 산점도는?');
    expect(buildPreviewText('풀이 과정을 서술하시오. [총 10점]'))
      .toBe('풀이 과정을 서술하시오.');
  });

  it('★ 객관식 보기는 stem 이 아니므로 첫 보기부터 잘라낸다', () => {
    const s = '다음 중 옳은 것은? ① 첫째 ② 둘째 ③ 셋째 ④ 넷째 ⑤ 다섯째';
    expect(buildPreviewText(s)).toBe('다음 중 옳은 것은?');
  });

  it('긴 본문은 단어 중간에서 자르지 않고 말줄임', () => {
    const long = '가'.repeat(60) + ' ' + '나'.repeat(80);
    const out = buildPreviewText(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(112);
  });

  it('내용이 없으면 빈 문자열 — 호출측이 기존 모티브로 폴백', () => {
    expect(buildPreviewText('')).toBe('');
    expect(buildPreviewText(null)).toBe('');
    expect(buildPreviewText(undefined)).toBe('');
    expect(buildPreviewText('$$')).toBe('');
    expect(buildPreviewText('[도형]')).toBe('');
  });

  // ★ 운영 DB 실제 본문 (이사벨중 23-3-1 #4·#17). String.raw 로 이스케이프 왜곡 차단.
  it('실데이터 — 표가 든 문제도 stem 만 남는다', () => {
    const real = String.raw`다음은 $5$명 학생의 한 달간 공부 시간의 평균과 표준편차를 나타낸 표이다. 공부 시간이 가장 고르지 않은 사람은? \begin{tabular}{|l|l|l|l|l|l|}\hline 학생 & ${'A'} & ${'B'} \\ \hline\end{tabular}`;
    const out = buildPreviewText(real);
    expect(out).toContain('공부 시간이 가장 고르지 않은 사람은?');
    expect(out).not.toMatch(/tabular|hline|egin/);
  });

  it('실데이터 — 빈칸 표(①②)가 든 서술형', () => {
    const real = String.raw`자연수 중 연속하는 세 짝수의 분산을 구하는 과정이다. 다음 물음에 답하시오. \begin{tabular}{|c|}\hline 연속하는 세 짝수 \\ \hline ( ① ), $2n+2$ \\ \hline\end{tabular}`;
    const out = buildPreviewText(real);
    expect(out).toBe('자연수 중 연속하는 세 짝수의 분산을 구하는 과정이다. 다음 물음에 답하시오.');
  });

  it('cases 환경도 제거', () => {
    const s = '연립방정식 \\begin{cases}x+y=3 \\\\ x-y=1\\end{cases} 을 풀어라.';
    const out = buildPreviewText(s);
    expect(out).not.toContain('cases');
    expect(out).toContain('연립방정식');
    expect(out).toContain('을 풀어라.');
  });
});
