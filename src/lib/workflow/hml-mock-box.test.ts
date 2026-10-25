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

  it('★★ 지문 "…다음 물음에 답하시오." 뒤 그림만 있는 문단은 다음 문제로 (학평 14-06 고2 #12/#13)', () => {
    const IMG = '<P><TEXT><PICTURE><IMAGE BinItem="1"/></PICTURE></TEXT></P>';
    const r = parseHml(Buffer.from(doc(
      P('기체의 부피는?', ' [정답] ⑤') + PT('① 1② 2③ 3') + PT('④ 4⑤ 5') +
      PT('그림과 같이 두 곡선이 만나는 점을 P라 하자. 다음 물음에 답하시오.') + IMG +
      P('선분 AB의 길이는?', ' [정답] ④') + PT('① 6② 7③ 8') + PT('④ 9⑤ 10')
    ), 'utf8'));
    expect(r.problems.length).toBe(2);
    expect(r.problems[0].choices[4]).toBe('⑤ 5');
    expect(r.problems[0].content).not.toContain('두 곡선');
    expect(r.problems[1].content).toContain('두 곡선');
    expect(r.problems[1].content).toContain('선분 AB의 길이는?');
    expect(r.problems[1].content.indexOf('두 곡선')).toBeLessThan(r.problems[1].content.indexOf('선분 AB'));
  });

  it('★★ 미주가 질문 문단에 붙은 문제 — 보기 ⑤ 뒤에 오는 설명·그림 문단은 다음 문제로 (학평 13-04 고3 #11)', () => {
    const r = parseHml(Buffer.from(doc(
      P('극한값은?', ' [정답] ④') + PT('[3.00점]') + PT('① $-2$② $-1$③ $0$') + PT('④ $1$⑤ $2$') +
      PT('그림과 같이 두 함수 $y=3\\sqrt{x}$, $y=\\sqrt{x}$의 그래프와 직선 $x=k$가 있다.') + PT('[도형]') +
      P('선분 $\\overline{BC}$, $\\overline{OC}$ 가 등비수열을 이룰 때, 양수 $k$의 값은?', ' [정답] ②') + PT('① 1② 2③ 3') + PT('④ 4⑤ 5')
    ), 'utf8'));
    expect(r.problems.length).toBe(2);
    expect(r.problems[0].choices[4]).toBe('⑤ $2$');
    expect(r.problems[0].content).not.toContain('그림과 같이');
    expect(r.problems[1].content.startsWith('그림과 같이')).toBe(true);
    expect(r.problems[1].content).toContain('[도형]');
    expect(r.problems[1].content).toContain('양수 $k$의 값은?');
  });
  it('서답형(보기 없음) 뒤 문단은 종전대로 현재 문제에 남는다 (회귀)', () => {
    const r = parseHml(Buffer.from(doc(
      P('다음 값을 구하시오.', ' [정답] $7$') + PT('$a+b$의 값을 구하시오.') + PT('[4.00점]') +
      P('다음 문제', ' [정답] ①') + PT('① 1② 2③ 3④ 4⑤ 5')
    ), 'utf8'));
    expect(r.problems[0].content).toContain('$a+b$의 값을 구하시오.');
  });
  it('★ 정답 `(2)` 꼴은 보기 번호 ②', () => {
    const r = parseHml(Buffer.from(doc(
      P('상수 $k$의 값은?', ' [정답] (2)') + PT('① $-1$② $-\\dfrac{1}{2}$③ $0$') + PT('④ $1$⑤ $2$')
    ), 'utf8'));
    expect(r.problems[0].answer).toBe('②');
  });

  it('★ 객관식인데 정답이 값(`$12$`)이면 같은 보기 번호(③)로', () => {
    const r = parseHml(Buffer.from(doc(
      P('$a_{3}$의 값은?', ' [정답] $12$[해설]…') + PT('① $6$② $9$③ $12$') + PT('④ $15$⑤ $18$')
    ), 'utf8'));
    expect(r.problems[0].choices.length).toBe(5);
    expect(r.problems[0].answer).toBe('③');
  });
  it('값이 보기와 안 맞으면 그대로 둔다 (잘못 바꾸지 않음)', () => {
    const r = parseHml(Buffer.from(doc(
      P('값은?', ' [정답] $7$') + PT('① $6$② $9$③ $12$') + PT('④ $15$⑤ $18$')
    ), 'utf8'));
    expect(r.problems[0].answer).toBe('$7$');
  });

  it('객관식 미주 `[정답] ④[해설]…` → ④', () => {
    const r = parseHml(Buffer.from(doc(
      P('옳은 것은?', ' [정답] ④[해설]풀이 전문') + PT('① 1② 2③ 3④ 4⑤ 5')
    ), 'utf8'));
    expect(r.problems[0].answer).toBe('④');
  });
});
