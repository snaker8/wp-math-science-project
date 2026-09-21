import { describe, it, expect } from 'vitest';
import { parseHml } from './hml-parser';

// 충렬고 25-2-1-M 수학2 (2026-09-21): 수학비서가 정답 미주를 비워서 내보낸 파일 — "[정답]" 이 없어 0문항이던 사고.
const P = (stem: string, endnote: string) =>
  `<P><TEXT CharShape="0"><ENDNOTE><PARALIST><P><TEXT CharShape="0"><CHAR>${endnote}</CHAR></TEXT></P></PARALIST></ENDNOTE><CHAR>${stem}</CHAR></TEXT></P>`;
const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?><HWPML Version="2.8"><BODY><SECTION>${body}</SECTION></BODY></HWPML>`;

describe('parseHml — 빈 미주도 문제 경계', () => {
  it('★ 미주가 비어 있어도(정답 없음) 문제로 잡힌다', () => {
    const r = parseHml(Buffer.from(doc(
      P('첫 번째 문제의 값은?', '') + '<P><TEXT><CHAR>① 1② 2③ 3</CHAR></TEXT></P>' +
      P('두 번째 문제의 값은?', '') + '<P><TEXT><CHAR>① 4② 5③ 6</CHAR></TEXT></P>'
    ), 'utf8'));
    expect(r.problems.length).toBe(2);
    expect(r.problems[0].answer).toBe('');
    expect(r.problems[0].content).toContain('첫 번째');
    expect(r.problems[1].content).toContain('두 번째');
  });

  it('정답이 든 미주는 종전대로 정답을 뽑는다', () => {
    const r = parseHml(Buffer.from(doc(
      P('문제 하나의 값은?', ' [정답] ④') + '<P><TEXT><CHAR>① 1② 2③ 3④ 4⑤ 5</CHAR></TEXT></P>'
    ), 'utf8'));
    expect(r.problems.length).toBe(1);
    expect(r.problems[0].answer).toBe('④');
  });
});
