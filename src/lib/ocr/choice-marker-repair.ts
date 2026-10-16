// ============================================================================
// 보기 마커 OCR 오인식 복구 — "(1) (2) (B) (4) (5)" → "(1) (2) (3) (4) (5)"  (2026-10-16)
// ----------------------------------------------------------------------------
// 사고: 센텀여고 극한 #17 — 원문자 ③ 이 Mathpix 에서 "(B)" 로 읽혀 (1)~(5) 세트가 4개가 되고,
//       모든 경로(자산화·재OCR·렌더)의 "5개 다 있어야 객관식" 가드에 걸려 **객관식이 주관식으로** 저장됐다.
// 규칙: 괄호 한 글자 마커가 연속으로 5개 있고 그중 **딱 한 자리**만 1~5 순서와 다르면 그 자리를 바로잡는다.
//       (1)(2)(3)(4)(5) 가 이미 맞으면 손대지 않는다. 두 자리 이상 틀리면 모른다 → 그대로(오탐 방지).
//       영문자 바로 뒤 "(N)"(f(1), Q(2)) 와 $…$ 수식 안은 마커로 보지 않는다.
// 호출처: reanalyze-crop normalizeChoiceParens · cloud-flow normalizeChoiceParensForCloudFlow ·
//         MixedContentRenderer normalizeChoiceParensForRender · extract-choices-from-ocr branch 2
// ============================================================================

const CONFUSABLE = /\(\s*([1-5A-Za-z0-9]|[①②③④⑤])\s*\)/g;

function inMath(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 200), idx);
  const dollars = (before.match(/(?<!\\)\$/g) || []).length;
  return dollars % 2 === 1 || /\\\(\s*$/.test(before);
}

/** 5개 마커 중 한 자리만 어긋난 것을 복구한 텍스트. 바꿀 게 없으면 원문 그대로. */
export function repairConfusedChoiceMarkers(text: string): string {
  if (!text) return text;
  const tokens: { idx: number; len: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  CONFUSABLE.lastIndex = 0;
  while ((m = CONFUSABLE.exec(text)) !== null) {
    const prev = m.index > 0 ? text[m.index - 1] : '';
    if (/[A-Za-z0-9]/.test(prev)) continue;          // f(1), x(2) 같은 함수 인수
    if (inMath(text, m.index)) continue;
    tokens.push({ idx: m.index, len: m[0].length, raw: m[1] });
  }
  // 마지막 5개만 본다 (보기는 본문 끝에 온다). 5개 미만이면 복구 대상 아님.
  if (tokens.length < 5) return text;
  const run = tokens.slice(-5);
  const expected = ['1', '2', '3', '4', '5'];
  const bad = run.map((t, i) => (t.raw === expected[i] ? -1 : i)).filter((i) => i >= 0);
  if (bad.length !== 1) return text;
  const i = bad[0];
  // 이미 올바른 숫자인데 자리만 다른 경우((1)(2)(5)(4)(5))도 같은 규칙으로 바로잡는다
  const t = run[i];
  return text.slice(0, t.idx) + `(${expected[i]})` + text.slice(t.idx + t.len);
}
