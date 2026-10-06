// ============================================================================
// 보기(선택지) 렌더 폭 추정 — 가로(5) 배치를 인쇄 칸에 어떻게 깔지 정하는 데 쓴다.
//
// 2026-10-06 대표: "sin 60° 같은 건 5개 한 줄이 길다, 3+2 가 맞다" / "sin A·√3 은 한 줄이 맞다".
// 종전 maxLen 은 $…$ 를 통째로 'XX' 로 바꿔 둘을 구분 못 했다. 여기서는 수식 안 글자를 실제 보이는 폭에 가깝게 센다.
//   \sin 60^{\circ} → "sin60°" = 6   /   \sin A → "sinA" = 4   /   -\sqrt{3} → "-√3" = 3   /   \frac{1}{3} → 세로 쌓임이라 1
// ============================================================================

/** 수식 한 덩어리의 보이는 글자 수 추정 */
export function estimateMathWidth(tex: string): number {
  let s = tex;
  // 분수: 분자/분모 중 긴 쪽 폭 (세로로 쌓이므로)
  for (let guard = 0; guard < 10; guard++) {
    const m = s.match(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/);
    if (!m) break;
    const w = Math.max(estimateMathWidth(m[1]), estimateMathWidth(m[2]), 1);
    s = s.replace(m[0], 'X'.repeat(w));
  }
  s = s
    .replace(/\\sqrt\s*(\[[^\]]*\])?/g, '√')
    .replace(/\\(?:circ|degree)\b/g, '°')
    .replace(/\\(?:left|right|displaystyle|textstyle|,|;|!|quad|qquad)\b/g, '')
    .replace(/\\(?:times|cdot|div|pm|mp|le|ge|ne|neq|leq|geq|to|rightarrow|infty|angle|triangle|overline|underline|bar|hat|vec|text|mathrm|mathbf|operatorname)\b/g, 'x')
    .replace(/\\([a-zA-Z]+)/g, '$1')      // \sin → sin, \pi → pi (글자 수 그대로)
    .replace(/[{}^_$]/g, '')
    .replace(/\s+/g, '');
  return s.length;
}

/** 보기 텍스트(①② 접두 제거된 본문) 전체의 보이는 글자 수 추정 — 수식은 estimateMathWidth, 나머지는 글자 수 */
export function estimateChoiceWidth(content: string): number {
  let total = 0;
  const re = /\$\$([\s\S]*?)\$\$|\$([^$]*)\$/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    total += content.slice(last, m.index).replace(/\s+/g, '').length;
    total += estimateMathWidth(m[1] ?? m[2] ?? '');
    last = m.index + m[0].length;
  }
  total += content.slice(last).replace(/\s+/g, '').length;
  return total;
}

export type HorizontalPlan = 'row' | 'grid3' | 'flow';

/**
 * 가로(5) 배치 계획 — 2단 인쇄 칸(약 345px) 기준.
 *   row  : 보기 ≤5개·최대 폭 ≤4 (sin A, √3, 분수, 한 자리 수) → 한 줄 N 등분
 *   grid3: 최대 폭 ≤9 (sin 60°, cos 60°, 2√3, x=−1) → 3열 그리드(5개면 3+2) — 대표 "3,2 가 맞다"
 *   flow : 그보다 길면 종전 흐름 배치(접힘 허용)
 */
export function planHorizontalChoices(widths: number[]): HorizontalPlan {
  if (widths.length === 0) return 'flow';
  const max = Math.max(...widths);
  if (widths.length <= 5 && max <= 4) return 'row';
  if (max <= 9) return 'grid3';
  return 'flow';
}
