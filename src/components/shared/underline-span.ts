// `<u>밑줄</u>` — 편집창 「밑줄」 버튼이 넣는 표기를 화면·인쇄에서 실제 밑줄로 그린다.
//
// 사고 (2026-11-18 대표: 「편집에 밑줄 기능 있는데 작동 안 한다」): 버튼은 `<u>…</u>` 를 넣는데 그리는 쪽에
//   처리가 없어 `<u>` 가 글자로 그대로 보였다. 굵게(bold-span.ts)와 같은 방식 — 태그를 토큰으로 걷고
//   그 사이의 모든 요소(텍스트·인라인 수식)에 underline 표시를 단다. 수식·굵게와 겹쳐도 된다.
//   짝이 안 맞으면 밑줄 없이 태그만 걷는다(찌꺼기 노출 금지, DB 원문은 불변).

export type UnderlineElement = { type: string; value?: string; underline?: boolean };

const TAG = /<\/?u>/g;

export function markUnderlineAcrossElements<T extends UnderlineElement>(elements: T[]): T[] {
  let opens = 0;
  let closes = 0;
  for (const el of elements) {
    if (el.type !== 'text') continue;
    const v = el.value ?? '';
    opens += (v.match(/<u>/g) || []).length;
    closes += (v.match(/<\/u>/g) || []).length;
  }
  if (opens === 0 && closes === 0) return elements;
  if (opens !== closes) {
    return elements.map((el) => (el.type === 'text' && TAG.test(el.value ?? '')
      ? { ...el, value: (el.value ?? '').replace(TAG, '') }
      : el));
  }

  const out: T[] = [];
  let open = false;
  for (const el of elements) {
    if (el.type !== 'text') {
      out.push(open ? { ...el, underline: true } : el);
      continue;
    }
    const v = el.value ?? '';
    let last = 0;
    const push = (seg: string) => {
      if (seg === '') return;
      out.push(open ? { ...el, value: seg, underline: true } : { ...el, value: seg });
    };
    for (const m of v.matchAll(TAG)) {
      push(v.slice(last, m.index));
      open = m[0] === '<u>';
      last = (m.index ?? 0) + m[0].length;
    }
    push(v.slice(last));
  }
  return out;
}
