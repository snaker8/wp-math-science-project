import { describe, it, expect } from 'vitest';
import { parseHml } from './hml-parser';

// 2026-10-25 평가원·학평(수학비서 HML) 탑재 점검에서 잡은 두 가지.
//   1) 「…구하는 과정이다」 박스: 표 1행 1칸 안에 문단이 여러 개 → 문단마다 \hline 을 넣어 14칸 표로 쌓이던 것
//   2) 미주가 `[정답] $48$[해설]…` 꼴 → 서답형 정답에 해설 전문이 딸려 들어가던 것
const P = (stem: string, endnote: string) =>
  `<P><TEXT CharShape="0"><ENDNOTE><PARALIST><P><TEXT CharShape="0"><CHAR>${endnote}</CHAR></TEXT></P></PARALIST></ENDNOTE><CHAR>${stem}</CHAR></TEXT></P>`;
const PT = (t: string) => `<P><TEXT><CHAR>${t}</CHAR></TEXT></P>`;
const cell = (...paras: string[]) => `<CELL><PARALIST>${paras.map(PT).join('')}</PARALIST></CELL>`;
const table = (...rows: string[]) => `<P><TEXT><TABLE>${rows.map((r) => `<ROW>${r}</ROW>`).join('')}</TABLE></TEXT></P>`;
const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?><HWPML Version="2.8"><BODY><SECTION>${body}</SECTION></BODY></HWPML>`;

describe('parseHml — 모의고사 박스·정답 (2026-10-25)', () => {
  it('★★ 1행 1칸에 문단 여러 개 = 선 없는 한 칸 박스 → 문단 사이 \\hline 없음', () => {
    const r = parseHml(Buffer.from(doc(
      P('다음은 값을 구하는 과정이다.', ' [정답] $48$') +
      table(cell('첫째 줄 설명', '둘째 줄 설명', '셋째 줄 설명')) +
      PT('위의 (가)에 알맞은 수를 구하시오.')
    ), 'utf8'));
    expect(r.problems.length).toBe(1);
    const c = r.problems[0].content;
    expect(c).toContain('\\begin{tabular}{|c|}');
    expect(c).toContain('첫째 줄 설명 \\\\ 둘째 줄 설명 \\\\ 셋째 줄 설명');
    // 바깥 테두리용 \hline 두 개(처음·끝)만
    expect((c.match(/\\hline/g) || []).length).toBe(2);
  });

  it('★ 행(ROW)이 여러 개인 1열 표는 종전대로 행 사이에 \\hline (요금표)', () => {
    const r = parseHml(Buffer.from(doc(
      P('요금표를 보고 답하시오.', ' [정답] $3$') +
      table(cell('A⇔B 1000원'), cell('B⇔C 2000원'), cell('A⇔C 2500원'))
    ), 'utf8'));
    const c = r.problems[0].content;
    expect(c).toContain('A⇔B 1000원 \\\\ \\hline B⇔C 2000원 \\\\ \\hline A⇔C 2500원');
  });

  it('★★ 미주 `[정답] $48$[해설]…` → 정답은 $48$ 까지만', () => {
    const r = parseHml(Buffer.from(doc(
      P('값을 구하시오.', ' [정답] $48$[해설]제1사분면에 있는 점은 두 곡선 위의 점이므로 … 따라서 48이다.')
    ), 'utf8'));
    expect(r.problems[0].answer).toBe('$48$');
  });

  it('객관식 미주 `[정답] ④[해설]…` → ④', () => {
    const r = parseHml(Buffer.from(doc(
      P('옳은 것은?', ' [정답] ④[해설]풀이 전문') + PT('① 1② 2③ 3④ 4⑤ 5')
    ), 'utf8'));
    expect(r.problems[0].answer).toBe('④');
  });
});
