import { describe, it, expect } from 'vitest';
import { stripSourceFootnote } from './hml-parser';

// ============================================================================
// 회귀 — 2026-09-01 반여고 실사고
//
// 수학비서 기출 HML 을 일괄 적재했더니 한 시험지에서 본문 3문항·보기 18문항이 오염됐다.
// 문항 끝의 출처·난이도 각주 표가 통째로 딸려 들어가, 보기 ⑤ 가 이렇게 저장됐다:
//   ⑤ $17$ \begin{tabular}{|l|l|}\hline [출처] & 내신 2025년 … [3.40점] \\ \hline
//           & ∙∘∘∘쉬움2 \\ \hline\end{tabular}
//
// ★ 좁게 잡는다 — `[출처]` 가 든 tabular 만 지운다.
//   조건 박스·데이터 표·그림 표는 절대 안 건드린다 (표 처리는 회귀 빈발 구간).
// ============================================================================

/** 실제 저장됐던 오염 문자열 */
const 오염된_보기 =
  '⑤ $17$\n\\begin{tabular}{|l|l|}\\hline [출처] & 내신 2025년 부산 해운대구 반여고 ' +
  '고1공통 1학기기말 공통수학1 2 [3.40점] \\\\ \\hline & ∙∘∘∘쉬움2 \\\\ \\hline\\end{tabular}';

describe('stripSourceFootnote', () => {
  it('출처 각주 표를 걷어내고 보기 내용만 남긴다', () => {
    const out = stripSourceFootnote(오염된_보기);
    expect(out).toBe('⑤ $17$');
    expect(out).not.toContain('[출처]');
    expect(out).not.toContain('tabular');
    expect(out).not.toContain('쉬움');
  });

  it('본문 뒤에 붙은 경우에도 본문은 온전히 남는다', () => {
    const src = '다음 식의 값을 구하시오. $x+1$\n' +
      '\\begin{tabular}{|l|l|}\\hline [출처] & 내신 2024년 … \\\\ \\hline\\end{tabular}';
    const out = stripSourceFootnote(src);
    expect(out).toBe('다음 식의 값을 구하시오. $x+1$');
  });

  it('[출처] 가 없는 표는 절대 건드리지 않는다 — 데이터 표 보호', () => {
    const table = '$x$ 값은?\n\\begin{tabular}{|c|c|}\\hline $x$ & $y$ \\\\ \\hline 1 & 2 \\\\ \\hline\\end{tabular}';
    expect(stripSourceFootnote(table)).toBe(table);
  });

  it('조건 박스(단일 열 tabular)도 보존한다', () => {
    const box = '\\begin{tabular}{|c|}\\hline (가) $a>0$ \\\\ \\hline (나) $b<0$ \\\\ \\hline\\end{tabular}';
    expect(stripSourceFootnote(box)).toBe(box);
  });

  it('출처 표와 데이터 표가 같이 있으면 출처 표만 지운다', () => {
    const src =
      '\\begin{tabular}{|c|c|}\\hline $x$ & $y$ \\\\ \\hline\\end{tabular}\n' +
      '\\begin{tabular}{|l|l|}\\hline [출처] & 내신 2025년 … \\\\ \\hline\\end{tabular}';
    const out = stripSourceFootnote(src);
    expect(out).toContain('$x$ & $y$');
    expect(out).not.toContain('[출처]');
  });

  // ── 평문 한 줄 형태 (2026-09-02, 포철고 실측) ──
  //   표가 아니라 그냥 줄로 들어오는 경우. (1) 표 제거만으로는 못 잡아 본문 끝에 남았다.
  it('평문 [출처] 줄을 지운다 — 표가 아닌 형태', () => {
    const src = '$f(2)$의 값은?\n[출처] [23년][1-1][중간][포철고][수학 상] 23';
    expect(stripSourceFootnote(src)).toBe('$f(2)$의 값은?');
  });

  it('평문 [출처] 줄이 여러 개여도 모두 지운다', () => {
    const src = '문제 본문\n[출처] A\n[출처] B';
    expect(stripSourceFootnote(src)).toBe('문제 본문');
  });

  it('본문 중간에 나온 [출처] 는 건드리지 않는다 — 줄 시작만 지운다', () => {
    const src = '다음 자료의 [출처] 를 밝히시오.';
    expect(stripSourceFootnote(src)).toBe(src);
  });

  it('[출처] 가 없으면 문자열을 그대로 돌려준다 (동일성 보장)', () => {
    const plain = '평범한 문제 본문 $a+b$';
    expect(stripSourceFootnote(plain)).toBe(plain);
  });

  it('빈 문자열에도 죽지 않는다', () => {
    expect(stripSourceFootnote('')).toBe('');
  });
});
