// ============================================================================
// HML 파서 회귀 테스트 — 표/그림 처리에서 반복된 회귀를 코드로 잠금.
//   2026-06 세션에 거제여중·온천중 .hml 로 같은 표 사고가 여러 번 재발 → 실제 파일로 고정.
//   ★ 파일이 로컬에 있을 때만 실행(없으면 skip) — 동래 2-1 기말 .hml 경로 의존.
//   거제여중 #18: 버스 요금 1열 박스 → 테두리 표 + 본문 제자리(다음 문제로 안 밀림).
//   온천중 #5/#10/#21/#22: 조건박스·그림 객관식·그림 나열·그림+설명 표.
// ============================================================================
import { existsSync, readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { parseHml } from './hml-parser';

const DIR = 'C:/Users/임세현/OneDrive/Documents/수학자료모음/학교내신기출문제/2-1 기말고사/[동래] 중등 2-1 기말';
const GJ = `${DIR}/내신 2023년 부산 연제구 거제여중 중2공통 1학기기말 중등수학2상.hml`;
const OC = `${DIR}/내신 2023년 부산 동래구 온천중 중2공통 1학기기말 중등수학2상.hml`;

// 표 안 ①②③ placeholder(빈칸/유도 과정)가 보기로 오인되던 사고 — 이사벨중 23-3-1 기말
const DIR31 = 'C:/Users/임세현/OneDrive/Documents/수학자료모음/학교내신기출문제/3-1 기말고사/[동래] 중등 3-1 기말';
const IS = `${DIR31}/내신 2023년 부산 연제구 이사벨중 중3공통 1학기기말 중등수학3상.hml`;

const haveFiles = existsSync(GJ) && existsSync(OC);
const d = haveFiles ? describe : describe.skip;
const dIS = existsSync(IS) ? describe : describe.skip;

d('HML 파서 회귀 (실제 .hml)', () => {
  const gj = haveFiles ? parseHml(readFileSync(GJ)) : { problems: [] as any[] };
  const oc = haveFiles ? parseHml(readFileSync(OC)) : { problems: [] as any[] };
  const find = (r: { problems: any[] }, n: number) => r.problems.find((p) => p.number === n);

  it('거제여중 #18 — 버스 요금 박스 표 복원 + 본문 제자리(19로 안 밀림)', () => {
    const p18 = find(gj, 18);
    expect(p18).toBeTruthy();
    expect(/begin\{tabular\}/.test(p18!.content)).toBe(true);       // 요금 박스 = 테두리 표
    expect(p18!.content).toContain('1200');                          // 요금 본문이 18에 있음
    const p19 = find(gj, 19);
    if (p19) expect(p19.content).not.toContain('1200');             // 19로 안 밀림
  });

  it('온천중 #10 — 그림 객관식(보기 ①~⑤ + 이미지 5개), 표 마크업 0', () => {
    const p = find(oc, 10);
    expect(p).toBeTruthy();
    expect(/begin\{tabular\}/.test(p!.content)).toBe(false);         // 표 마크업 누출 0
    expect(p!.choices.length).toBe(5);
    expect(p!.choiceImagesBase64.filter(Boolean).length).toBe(5);   // 보기 이미지 5개
  });

  it('온천중 #21 — 그림 나열은 인라인, x/y 데이터 표는 격자 보존', () => {
    const p = find(oc, 21);
    expect(p).toBeTruthy();
    // 그림([도형])은 인라인으로 존재, 그림용 표 마크업은 없음. x/y 표(텍스트)만 tabular 로 남음.
    expect(p!.content).toContain('[도형]');
    expect(p!.content).toContain('\\begin{tabular}');               // x/y 데이터 표
    // 그림 바로 옆에 begin{tabular} 가 붙어있지 않아야(그림이 표 안에 갇히지 않음)
    expect(/\[도형\]\s*&/.test(p!.content)).toBe(false);
  });

  it('온천중 #22 — 그림+설명 그리드는 인라인(표 마크업 0)', () => {
    const p = find(oc, 22);
    expect(p).toBeTruthy();
    expect(/begin\{tabular\}/.test(p!.content)).toBe(false);
    expect(p!.content).toContain('[도형]');
  });
});

dIS('HML 파서 회귀 — 표 안 동그라미 placeholder (이사벨중 23-3-1)', () => {
  const is = parseHml(readFileSync(IS));
  const find = (n: number) => is.problems.find((p) => p.number === n);

  it('#8 — 근의공식 표(#9)가 흡수되지 않고 진짜 보기 ①~⑤ 5개', () => {
    const p = find(8);
    expect(p).toBeTruthy();
    expect(p!.content).toContain('$x^{2}-4x+k=0$');          // #8 본문
    expect(p!.content).not.toContain('근의 공식');            // #9 지문 안 섞임
    expect(p!.choices.length).toBe(5);
    expect(p!.choices.every((c) => !/hline|tabular/.test(c))).toBe(true); // garbage 0
  });

  it('#9 — 근의공식 유도 표가 본문에 온전히 + 진짜 보기 ①~⑤(①$4a$…)', () => {
    const p = find(9);
    expect(p).toBeTruthy();
    expect(p!.content).toContain('근의 공식');
    expect(/begin\{tabular\}/.test(p!.content)).toBe(true);  // 유도 표는 본문에
    expect(p!.choices.length).toBe(5);
    expect(p!.choices[0]).toContain('4a');                   // 표 placeholder 아닌 진짜 보기
    expect(p!.choices.every((c) => !/hline|tabular/.test(c))).toBe(true);
  });

  it('#17 — 빈칸(①②) 표는 서답형: 보기로 추출 안 함', () => {
    const p = find(17);
    expect(p).toBeTruthy();
    expect(p!.choices.length).toBe(0);                        // 표 안 ( ① )( ② )는 보기 아님
    expect(/begin\{tabular\}/.test(p!.content)).toBe(true);   // 빈칸 표는 본문 유지
  });
});
