// 블록 요소(조건 박스·표·그림·디스플레이 수식) 앞뒤의 줄바꿈을 걷는다.
//
// 사고 (2026-09-21, 대표 캡처 「표가 들어가면 위아래 간격이 많이 벌어지는 현상」):
//   본문이 `…만족시킨다.\n__CONDITION_BOX_0__\n점 A에서…` 로 오면 텍스트 세그먼트가 줄바꿈마다 <br> 을 찍어
//   박스 위아래에 빈 줄이 한 줄씩 생기고, 거기에 박스 자체 여백(my-3)까지 더해져 40px 가까이 벌어졌다.
//   블록은 제 여백으로 이미 떨어져 있으므로 이웃 텍스트의 여백 줄바꿈은 뜻이 없다 — 걷는다.
//   문장 안 줄바꿈(텍스트↔텍스트)은 그대로 둔다.

export type GapElement = { type: string; value?: string };

const BLOCK_PLACEHOLDER = /^__(?:CONDITION|SOLUTION)_BOX_\d+__$/;

export function isBlockElement(el: GapElement): boolean {
  if (el.type === 'table' || el.type === 'image' || el.type === 'display-math') return true;
  return el.type === 'text' && BLOCK_PLACEHOLDER.test((el.value ?? '').trim());
}

/** 제자리에서 다듬고, 비어 버린 텍스트 요소는 뺀다. 반환 = 같은 배열. */
export function trimNewlinesAroundBlocks<T extends GapElement>(elements: T[]): T[] {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== 'text' || isBlockElement(el)) continue;
    const prevBlock = i > 0 && isBlockElement(elements[i - 1]);
    const nextBlock = i < elements.length - 1 && isBlockElement(elements[i + 1]);
    let v = el.value ?? '';
    if (prevBlock) v = v.replace(/^[ \t]*(?:\r?\n[ \t]*)+/, '');
    if (nextBlock) v = v.replace(/(?:[ \t]*\r?\n)+[ \t]*$/, '');
    el.value = v;
  }
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === 'text' && el.value === '' && !isBlockElement(el)) elements.splice(i, 1);
  }
  return elements;
}
