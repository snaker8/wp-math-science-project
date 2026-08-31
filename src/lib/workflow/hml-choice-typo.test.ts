import { describe, it, expect } from 'vitest';
import { splitChoices } from './hml-parser';

// ============================================================================
// 회귀 — 2026-09-01 반여고 확률과통계 #3 (실측)
//
// 수학비서 **원본에 보기 번호 오타**가 있는 파일이 드물게 있다:
//     ① 3/16   ② 1/4   ③ 5/16
//     ③ 3/8    ⑤ 7/16          ← ④ 가 ③ 으로 오타
//
// 파서는 "보기 번호가 증가하다 끊긴 지점"을 새 보기 시작으로 봤다. 마커가 1,2,3,3,5 라
// 네 번째에서 끊긴 것으로 판정해 **뒤 2개만** 보기로 잡았다. 결과:
//   · 멀쩡한 보기 3개가 본문에 남아 버려짐
//   · 정답이 ⑤ 인데 보기가 2개뿐 → 보기 범위 밖 → **채점 불가**
//
// 원본은 우리가 못 고치므로 파서가 견뎌야 한다. ① 로 시작하는 4~6개 꼬리 구간이 있으면
// 오타 1개까지 허용하고 그쪽을 보기로 채택한다.
//
// ★ 오타 번호(③ 중복)는 **고치지 않는다.** 원본과 달라지면 나중에 대조가 안 된다.
//   위치만 맞으면 정답 매칭은 정상 동작한다.
// ============================================================================

/** 실측 문자열 (반여고 확률과통계 #3) */
const 실측 =
  '연속확률변수 $X$의 확률밀도함수의 그래프가 다음과 같을 때의 값은?\n[도형]\n' +
  '① $\\dfrac{3}{16}$② $\\dfrac{1}{4}$③ $\\dfrac{5}{16}$\n' +
  '③ $\\dfrac{3}{8}$⑤ $\\dfrac{7}{16}$';

describe('보기 번호 오타 내성 (수학비서 원본 결함)', () => {
  it('④ 가 ③ 으로 오타여도 보기 5개를 모두 살린다', () => {
    const { choices } = splitChoices(실측);
    expect(choices).toHaveLength(5);
  });

  it('본문에 보기 마커가 남지 않는다', () => {
    const { content } = splitChoices(실측);
    expect(content).not.toMatch(/[①②③④⑤]/);
    expect(content).toContain('확률밀도함수');   // 스템은 온전히 남는다
  });

  it('오타 번호를 임의로 고치지 않는다 — 원본 보존', () => {
    const { choices } = splitChoices(실측);
    expect(choices[3]).toContain('③');            // 오타 그대로
    expect(choices[3]).toContain('\\dfrac{3}{8}'); // 내용은 4번째 것
  });

  it('정답 ⑤ 가 보기 범위 안에 들어온다 — 채점 가능', () => {
    const { choices } = splitChoices(실측);
    expect('①②③④⑤'.indexOf('⑤')).toBeLessThan(choices.length);
  });
});

describe('정상 케이스는 종전 동작 유지', () => {
  it('한 줄 5지선다', () => {
    const { choices } = splitChoices('값은?\n① $1$② $2$③ $3$④ $4$⑤ $5$');
    expect(choices).toHaveLength(5);
  });

  it('두 줄로 나뉜 정상 5지선다', () => {
    const { choices } = splitChoices('값은?\n① $1$② $2$③ $3$\n④ $4$⑤ $5$');
    expect(choices).toHaveLength(5);
  });

  it('스템의 짧은 참조 런(①과 ②)은 보기로 오인하지 않는다', () => {
    const { content, choices } = splitChoices(
      '위 그림에서 ① 과 ② 를 비교하시오.\n① $1$② $2$③ $3$④ $4$⑤ $5$',
    );
    expect(choices).toHaveLength(5);
    expect(content).toContain('비교하시오');
  });

  it('보기가 없으면 본문을 그대로 돌려준다', () => {
    const body = '다음을 구하시오. $x+1$';
    const { content, choices } = splitChoices(body);
    expect(choices).toHaveLength(0);
    expect(content).toBe(body);
  });

  it('오타가 2개 이상이면 억지로 맞추지 않는다', () => {
    // 1,3,3,3,5 — 어긋남이 둘 이상이면 기존 판정을 따른다
    const { choices } = splitChoices('값은?\n① $1$③ $2$③ $3$③ $4$⑤ $5$');
    expect(choices.length).toBeLessThan(5);
  });
});

describe('마지막 보기 뒤 배점 표기 제거', () => {
  it('[3.20점] 이 보기에 섞이지 않는다', () => {
    const { choices } = splitChoices('값은?\n① $1$② $2$③ $3$④ $4$⑤ $5$\n[3.20점]');
    expect(choices[4]).not.toMatch(/점\s*\]/);
    expect(choices[4]).toContain('$5$');
  });
});
