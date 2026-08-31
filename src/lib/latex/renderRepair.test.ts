import { describe, it, expect } from 'vitest';
import { repairLatexRender } from './renderRepair';

// ============================================================================
// 회귀 — 2026-08-31 KaTeX 렌더 실패 실측 조사
//
// 운영 DB 6,313문제를 KaTeX 로 실제 렌더해 실패 49건을 원인별로 분류했다.
// 그중 **기계적으로 100% 안전한 두 유형만** Rule D·E 로 처리한다.
//   Rule D  `\left {a_{n} \right }`      — 중괄호 이스케이프 누락 (HWP→LaTeX 변환 결함)
//   Rule E  `{cases{x+ y =6#2x+y=10}}`   — 한글 수식 문법이 변환 안 되고 남음
//
// 실측 결과: 깨진 49건 중 12건 완전 복구 / 더 나빠진 것 0건 /
//           정상 5,658건 대조군에서 깨진 것 0건.
//
// ★ `$` 경계 어긋남(13건)은 일부러 안 고친다 — 잘못 고치면 본문이 손상된다.
//   자동 수리가 원본을 망치느니 검수로 넘기는 편이 낫다. 이 원칙을 지킬 것.
// ============================================================================

describe('Rule D — \\left { 중괄호 이스케이프 복원', () => {
  it('실측 문자열을 복원한다', () => {
    const { fixed, changes } = repairLatexRender('$\\left {a_{n} \\right }$');
    expect(fixed).toBe('$\\left\\{a_{n} \\right\\}$');
    expect(changes.some((c) => c.includes('중괄호'))).toBe(true);
  });

  it('공백이 여러 개여도 복원한다', () => {
    expect(repairLatexRender('$\\left   {x \\right   }$').fixed).toBe('$\\left\\{x \\right\\}$');
  });

  it('이미 올바른 \\left\\{ 는 건드리지 않는다', () => {
    const ok = '$\\left\\{ x \\right\\}$';
    expect(repairLatexRender(ok).fixed).toBe(ok);
    expect(repairLatexRender(ok).changes).toHaveLength(0);
  });

  it('\\leftarrow 처럼 이름이 이어지는 명령은 건드리지 않는다', () => {
    const ok = '$a \\leftarrow b$';
    expect(repairLatexRender(ok).fixed).toBe(ok);
  });
});

describe('Rule E — 한글 cases{A#B} 변환', () => {
  it('실측 문자열을 \\begin{cases} 로 바꾼다', () => {
    const { fixed } = repairLatexRender('${cases{x+ y =6#2x+y=10}}$');
    expect(fixed).toContain('\\begin{cases}');
    expect(fixed).toContain('\\end{cases}');
    expect(fixed).toContain('x+ y =6');
    expect(fixed).toContain('2x+y=10');
    expect(fixed).not.toContain('#');
  });

  it('세 줄짜리도 처리한다', () => {
    const { fixed } = repairLatexRender('$cases{a=1#b=2#c=3}$');
    // 행 구분자 \\ 가 두 번 들어가야 한다
    expect((fixed.match(/\\\\/g) || []).length).toBe(2);
  });

  it('# 가 없으면 손대지 않는다 — cases 가 아닐 수 있다', () => {
    const ok = '$cases{x=1}$';
    expect(repairLatexRender(ok).fixed).toBe(ok);
  });

  it('이미 LaTeX 인 \\begin{cases} 는 건드리지 않는다', () => {
    const ok = '$\\begin{cases}a \\\\ b\\end{cases}$';
    expect(repairLatexRender(ok).fixed).toBe(ok);
  });
});

describe('안전성 — 손대면 안 되는 것', () => {
  it('평범한 본문은 그대로 둔다', () => {
    const ok = '다음 물음에 답하시오. $x^2 + 2x + 1 = 0$ 의 해를 구하시오.';
    expect(repairLatexRender(ok).fixed).toBe(ok);
    expect(repairLatexRender(ok).changes).toHaveLength(0);
  });

  it('빈 입력·null 에도 죽지 않는다', () => {
    expect(repairLatexRender('').fixed).toBe('');
    expect(repairLatexRender(null as unknown as string).fixed).toBe('');
  });

  it('$ 경계가 어긋난 본문은 일부러 안 고친다 (본문 손상 위험)', () => {
    // $ 가 홀수개 — 자동 수리 대상 아님. 검수로 넘어가야 한다.
    const odd = '$x=1$ 이고 $y=2 를 만족';
    expect(repairLatexRender(odd).fixed).toBe(odd);
  });
});
