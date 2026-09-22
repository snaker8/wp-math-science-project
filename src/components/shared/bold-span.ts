// `**굵게**` 가 인라인 수식을 사이에 두고 걸쳐 있을 때 — 요소 경계를 넘어 굵게 표시.
//
// 사고 (2026-09-22, 주례여고 25-1-2-M #점과 직선 거리 증명): `**❷ $l$이 $y$축에 평행할 때**` 가 화면에 `**` 째로 노출.
//   파서가 `$…$` 마다 요소를 쪼개서 여는 `**` 와 닫는 `**` 가 서로 다른 텍스트 요소에 떨어졌고, 텍스트 안에서만 보는
//   `**(.+?)**` 정규식이 못 잡았다. 여기서 `**` 를 토큰으로 걷고, 그 사이의 모든 요소에 bold 표시를 단다.
//   짝이 안 맞는 `**` 는 그대로 둔다(원문 보존).

export type BoldElement = { type: string; value?: string; bold?: boolean };

export function markBoldAcrossElements<T extends BoldElement>(elements: T[]): T[] {
  // 1) 짝 검사 — 텍스트 요소들의 `**` 총 개수가 홀수면 손대지 않는다
  let total = 0;
  for (const el of elements) if (el.type === 'text') total += ((el.value ?? '').match(/\*\*/g) || []).length;
  if (total === 0 || total % 2 === 1) return elements;

  const out: T[] = [];
  let open = false;
  for (const el of elements) {
    if (el.type !== 'text') {
      out.push(open ? { ...el, bold: true } : el);
      continue;
    }
    const v = el.value ?? '';
    if (!v.includes('**')) { out.push(open ? { ...el, bold: true } : el); continue; }
    const parts = v.split('**');
    parts.forEach((seg, k) => {
      if (k > 0) open = !open;
      if (seg === '') return;
      out.push(open ? { ...el, value: seg, bold: true } : { ...el, value: seg });
    });
  }
  return out;
}
