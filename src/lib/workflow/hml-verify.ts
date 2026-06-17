// ============================================================================
// HML 가져오기 — 룰베이스 검증 루프 (비용 0, AI 미사용)
//   문제마다 결정론적으로 점검 → 사람이 검수할 사유(warnings[]) 산출.
//   "90% 완성도면 못 쓴다" → 자동검증으로 의심 문제를 ⚠️ 플래그하고,
//   사람이 플래그된 것만 확정하면 100% 검수가 보장되도록 하는 게 목표.
//
//   ★ 룰베이스가 못 잡는 것(원문 자체의 수식 오타 등 의미 오류)은 한계로 남김.
//     단, 구조적 신호(렌더 실패/미변환 마크업/정답 누락/이미지 누락)는 빠짐없이 잡는다.
// ============================================================================

import katex from 'katex';

export interface HmlVerifyInput {
  number: number;
  content: string;       // 본문 ([도형] 마커 + $LaTeX$)
  choices: string[];     // 정규화된 보기 (① prefix)
  answer: string;        // 추출된 정답 (객관식: ①~⑤ / 서답형: 보통 빈값)
  isObjective: boolean;  // 보기 ≥ 2개
  imagesExpected: number; // 본문 [도형] 마커 개수
  imagesSaved: number;    // Storage 업로드 성공 개수
  /** 그림 객관식: 이미지가 채워진 보기 수 (0=텍스트 보기) */
  choiceImagesPresent?: number;
}

const CIRCLED_ONE = /^[①②③④⑤⑥⑦⑧⑨⑩]$/;

/** `$...$` 인라인 수식 본문만 추출 */
function mathSegments(s: string): string[] {
  const out: string[] = [];
  const re = /\$([^$]+)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const seg = m[1].trim();
    if (seg) out.push(seg);
  }
  return out;
}

/**
 * 한 문제를 검증 → 검수 사유 목록(빈 배열이면 자동검증 통과).
 *   순서: 본문 → KaTeX 렌더 → 미변환 마크업 → base64 누출 → 괄호/$ 균형 → 정답 → 이미지.
 */
export function verifyHmlProblem(p: HmlVerifyInput): string[] {
  const warnings: string[] = [];
  const allText = [p.content, ...p.choices].join('\n');

  // 1) 본문 없음
  if (!p.content.trim()) warnings.push('본문 없음');

  // 2) KaTeX 렌더 실패 — 실제로 깨지는 수식
  let katexFail = 0;
  let firstBad = '';
  for (const seg of mathSegments(allText)) {
    try {
      katex.renderToString(seg, { throwOnError: true, displayMode: false, strict: false });
    } catch {
      katexFail++;
      if (!firstBad) firstBad = seg.slice(0, 30);
    }
  }
  if (katexFail) warnings.push(`수식 렌더 실패 ${katexFail}건 ("${firstBad}…")`);

  // 3) 미변환 한글 마크업 (변환 후에도 bare 토큰이 남으면 누락) — 백슬래시 붙은 건 제외
  const residual: string[] = [];
  if (/(?<![\\A-Za-z])over(?![A-Za-z])/.test(allText)) residual.push('over');
  if (/(?<![\\A-Za-z])sqrt(?![A-Za-z])/.test(allText)) residual.push('sqrt');
  if (/(?<![\\A-Za-z])(?:left|right)(?![A-Za-z])/.test(allText)) residual.push('left/right');
  if (/\+-|-\+/.test(allText)) residual.push('±(+-)');
  if (residual.length) warnings.push(`미변환 수식 마크업: ${residual.join(', ')}`);

  // 4) 잔여 base64 (이미지 데이터 누출) — cleanText 백스톱
  if (/[A-Za-z0-9+/]{50,}={0,2}/.test(allText.replace(/\s+/g, ''))) {
    warnings.push('이미지 데이터 누출(base64 잔재)');
  }

  // 5) 수식 기호($) 짝 + 괄호 균형
  const dollarCount = (p.content.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) warnings.push('수식 기호($) 짝 안 맞음');
  for (const seg of mathSegments(allText)) {
    const open = (seg.match(/\{/g) || []).length;
    const close = (seg.match(/\}/g) || []).length;
    if (open !== close) { warnings.push('수식 괄호({}) 불균형'); break; }
  }

  // 6) 정답
  if (p.isObjective) {
    if (!CIRCLED_ONE.test(p.answer.trim())) warnings.push('객관식 정답 미추출(①~⑤)');
  } else if (!p.answer.trim()) {
    warnings.push('서답형 정답 미입력(검수 필요)');
  }

  // 7) 도형 이미지 누락 (마커는 있는데 업로드 적음)
  if (p.imagesExpected > p.imagesSaved) {
    warnings.push(`도형 이미지 누락(${p.imagesSaved}/${p.imagesExpected})`);
  }

  // 8) 객관식 보기 수 비정상 (보통 4~5지선다 — 3개 이하면 split 오류 의심)
  if (p.isObjective && p.choices.length < 4) {
    warnings.push(`보기 ${p.choices.length}개 — 분리 확인`);
  }

  // 9) 그림 객관식 보기 이미지 부분 누락 (일부 보기만 이미지 = 매핑 어긋남)
  const ci = p.choiceImagesPresent ?? 0;
  if (ci > 0 && ci < p.choices.length) {
    warnings.push(`보기 이미지 일부 누락(${ci}/${p.choices.length})`);
  }

  // 10) 페이지 머리말/정답지 잔재 (제N교시·수학영역·빠른정답이 본문에 남음 = 경계 오류)
  if (/제\s*\d\s*교시|수학영역|빠른\s*정답/.test(p.content)) {
    warnings.push('페이지 머리말/정답지 잔재 — 확인');
  }

  // 11) 도형 placeholder 텍스트 잔재 (HWP 도형 alt 텍스트가 [도형] 없이 본문에 샘)
  if (/(?:^|[\s.])(?:선|사각형|삼각형|원|타원|화살표|직선)입니다/.test(p.content) && !p.content.includes('[도형]')) {
    warnings.push('도형 텍스트 잔재 — 확인');
  }

  // 12) 본문에 표 의심 (연속 $…$ 4개+ = 좌표배치 표가 납작해진 흔적).
  //   HML 엔 표 구조 정보가 없어 자동복원 불가 → 사람이 캡쳐(이미지)/표삽입으로 보강하라고 안내.
  //   ($..$ 사이 텍스트 없는 런만 — 일반 수식 나열은 사이에 텍스트가 있어 안 걸림.)
  if (/(?:\$[^$]*\$\s*){4,}/.test(p.content)) {
    warnings.push('표 포함 의심 — 수동 확인(캡쳐/표삽입)');
  }

  return warnings;
}
