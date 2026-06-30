// ============================================================================
// OCR 텍스트 → 객관식 선택지 추출 (reanalyze-crop "텍스트 다시 읽기" 경로)
//   ★ 순수 함수로 분리 — 실함수 회귀 테스트(extract-choices-from-ocr.test.ts).
//   원형 ①②③④⑤ / (1)~(5) / 1)~5) 세 포맷을 정방향 분리.
// ============================================================================

/**
 * OCR 텍스트에서 선택지 추출
 *   정방향 분리: 보기 마커 위치를 찾고 사이 텍스트를 추출.
 *
 * ★ branch 1 (원형 ①②③④⑤) 가드 — CLAUDE.md Gard #9 "동그라미=무조건 객관식 아님".
 *   본문의 \boxed{①}~\boxed{⑤} placeholder(빈칸채우기 "①~⑤에 들어갈 내용") 를 보기로
 *   오인해 본문을 통째 토막내던 사고(장전중 25-3-1 #4 회귀). branch 2·3 엔 5지선다 가드가
 *   있었지만(318b19f) 원형 분기만 무가드로 남아 재발. 두 겹으로 방어:
 *     1) \boxed{...} 안 동그라미는 placeholder → 제외
 *     2) 진짜 보기 = "마지막 증가 런(①②③④⑤)" 이 ①부터 시작 + 길이 ≥4 일 때만 인정
 *        (한국 객관식은 5지선다, ⑤가 (5)로 OCR돼 병합된 4개 포함). 스템참조("①~⑤", "①을 ②에")·
 *        산발 동그라미는 런이 짧거나 ①시작이 아니라 배제 → fall through → 최종 [] 반환.
 *   [] 반환 시 호출측(handleReadText)은 기존 보기를 보존(덮어쓰지 않음) → 데이터 손실 0.
 */
export function extractChoicesFromOCR(text: string): string[] {
  // 1. ①②③④⑤ 정방향 분리
  const circledRegex = /[①②③④⑤]/g;
  const positions: { idx: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = circledRegex.exec(text)) !== null) {
    positions.push({ idx: m.index, len: m[0].length });
  }
  if (positions.length >= 2) {
    // ── 가드 1: \boxed{...} 안 placeholder 동그라미 제외 ──
    const boxedSpans: [number, number][] = [];
    {
      const re = /\\boxed\s*\{[^{}]*\}/g;
      let bm: RegExpExecArray | null;
      while ((bm = re.exec(text)) !== null) boxedSpans.push([bm.index, bm.index + bm[0].length]);
    }
    const inBoxed = (i: number) => boxedSpans.some(([s, e]) => i >= s && i < e);
    const real = positions.filter((p) => !inBoxed(p.idx));

    // ── 가드 2: 마지막 증가 런이 ①부터 시작 + 길이 ≥4 일 때만 진짜 보기 ──
    if (real.length >= 2) {
      const vals = real.map((p) => '①②③④⑤'.indexOf(text[p.idx]) + 1); // 1..5
      let runStart = 0;
      for (let k = 1; k < real.length; k++) {
        if (vals[k] <= vals[k - 1]) runStart = k;
      }
      const run = real.slice(runStart);
      if (run.length >= 4 && vals[runStart] === 1) {
        const choices: string[] = [];
        for (let i = 0; i < run.length; i++) {
          const start = run[i].idx + run[i].len;
          const end = i + 1 < run.length ? run[i + 1].idx : text.length;
          const choiceText = text.substring(start, end).trim();
          if (choiceText) choices.push(choiceText);
        }
        if (choices.length >= 2) return choices.map(normalizeChoiceText);
      }
    }
    // 보기로 확정 못 하면 아래 (1)~(5) / 1)~5) 분기로 진행 (그것도 아니면 최종 [])
  }

  // 2. (1) (2) (3) (4) (5) 정방향 분리
  // ★ CLAUDE.md 가드 #2 — 한국 객관식은 항상 5지선다. 5개(1)~(5) 모두 있을 때만 choices 로 처리.
  //    그 외엔 서답형 소문제 (1)(2)(3) 또는 (1)(2)(3)(4) 로 간주 → 빈 배열 반환.
  //    추가 안전망: 키워드 검출 (구하시오/설명하시오 등)
  {
    const subProblemKeywords = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오/;
    const parenRegex = /\(([1-5])\)/g;
    const parenPositions: { idx: number; len: number; num: number }[] = [];
    let m2: RegExpExecArray | null;
    while ((m2 = parenRegex.exec(text)) !== null) {
      parenPositions.push({ idx: m2.index, len: m2[0].length, num: parseInt(m2[1]) });
    }

    if (parenPositions.length >= 2) {
      // ★ 5지선다 가드 — (1)~(5) 5개 모두 있어야 객관식. 그 외엔 서답형 소문제.
      const nums = new Set(parenPositions.map((p) => p.num));
      const hasFullObjectiveSet = nums.has(1) && nums.has(2) && nums.has(3) && nums.has(4) && nums.has(5);
      if (!hasFullObjectiveSet) {
        return [];
      }

      // 각 (N) 뒤 텍스트에서 서술형 키워드 확인 (5개 다 있어도 서술형일 수 있어 추가 안전망)
      let hasSubProblem = false;
      for (let i = 0; i < parenPositions.length; i++) {
        const start = parenPositions[i].idx + parenPositions[i].len;
        const end = i + 1 < parenPositions.length ? parenPositions[i + 1].idx : text.length;
        const segment = text.substring(start, end).trim();
        if (subProblemKeywords.test(segment)) {
          hasSubProblem = true;
          break;
        }
      }
      if (hasSubProblem) {
        return [];
      }

      const choices: string[] = [];
      for (let i = 0; i < parenPositions.length; i++) {
        const start = parenPositions[i].idx + parenPositions[i].len;
        const end = i + 1 < parenPositions.length ? parenPositions[i + 1].idx : text.length;
        const choiceText = text.substring(start, end).trim();
        if (choiceText) choices.push(choiceText);
      }
      if (choices.length >= 2) return choices.map(normalizeChoiceText);
    }
  }

  // 3. 1) 2) 3) ... 정방향 분리
  // ★ 동일 5지선다 가드 + 서술형 감지
  const numRegex = /(?:^|\s)([1-5])\s*\)/gm;
  const numPositions: { idx: number; len: number; num: number }[] = [];
  let m3: RegExpExecArray | null;
  while ((m3 = numRegex.exec(text)) !== null) {
    numPositions.push({ idx: m3.index, len: m3[0].length, num: parseInt(m3[1]) });
  }

  if (numPositions.length >= 2) {
    // ★ 5지선다 가드 — 1)~5) 모두 있어야 객관식
    const nums2 = new Set(numPositions.map((p) => p.num));
    const hasFullSet2 = nums2.has(1) && nums2.has(2) && nums2.has(3) && nums2.has(4) && nums2.has(5);
    if (!hasFullSet2) {
      return [];
    }

    const subProblemKw2 = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오/;
    let hasSub2 = false;
    for (let i = 0; i < numPositions.length; i++) {
      const start = numPositions[i].idx + numPositions[i].len;
      const end = i + 1 < numPositions.length ? numPositions[i + 1].idx : text.length;
      if (subProblemKw2.test(text.substring(start, end))) { hasSub2 = true; break; }
    }
    if (hasSub2) return [];

    const choices: string[] = [];
    for (let i = 0; i < numPositions.length; i++) {
      const start = numPositions[i].idx + numPositions[i].len;
      const end = i + 1 < numPositions.length ? numPositions[i + 1].idx : text.length;
      const choiceText = text.substring(start, end).trim();
      if (choiceText) choices.push(choiceText);
    }
    if (choices.length >= 2) return choices.map(normalizeChoiceText);
  }

  return [];
}

/** 선택지 텍스트 정규화: Mathpix 수식 포맷 → $...$, 원번호 제거 */
export function normalizeChoiceText(text: string): string {
  let result = text
    .replace(/^[①②③④⑤]\s*/, '')   // 원번호 제거
    .trim();

  // 1. 완전한 \( ... \) → $ ... $  (멀티라인 's' 플래그)
  result = result.replace(/\\\((.+?)\\\)/gs, (_, inner) => `$${inner.trim()}$`);

  // 2. 불완전한 \( (닫는 \) 없음) — 선택지 분리 시 끝이 잘린 경우
  //    예: "\( -x^{2}-2x-8"  →  "$ -x^{2}-2x-8$"
  result = result.replace(/\\\((.+)$/s, (_, inner) => `$${inner.trim()}$`);

  // 3. 불완전한 \) (여는 \( 없음) — 앞이 잘린 경우
  //    예: "-x^{2}-2x-8 \)"  →  "$ -x^{2}-2x-8$"
  result = result.replace(/^(.+?)\\\)(\s*)$/s, (_, inner) => `$${inner.trim()}$`);

  // 4. \[ ... \] → $$ ... $$
  result = result.replace(/\\\[(.+?)\\\]/gs, (_, inner) => `$$${inner.trim()}$$`);

  // 5. 선택지 전체가 bare LaTeX인 경우 ($로 감싸기)
  //    예: "-x^{2}-2x-8" (이미 \(없이 순수 LaTeX만 있는 경우)
  //    조건: $가 없고, \frac \sqrt ^ _ 등 LaTeX 기호가 있고, 한글이 없는 경우
  if (!result.includes('$') && /[\\^_{}]/.test(result) && !/[가-힣]/.test(result)) {
    result = `$${result.trim()}$`;
  }

  return result.trim();
}
