// 테두리/조건 박스(isChoiceTabular)를 각 조건 줄로 변환하는 순수 함수.
// MixedContentRenderer(.tsx)에서 분리 — vitest 가 직접 import 해 실제 코드를 테스트(복제 drift 방지).

// ★ \boxed{ ㉠ } 처럼 "원문자(㉠㉡)·원숫자(①②)·한글"만 든 빈칸 라벨 박스는 KaTeX 로 그리면
//   안 된다 (2026-07-23 사고). KaTeX 에 이 글자들의 폭 정보(character metrics)가 없어
//   박스가 0폭으로 계산돼 라벨을 감싸지 못한다("박스가 동그라미 기호를 안 감쌈"). 실측 확인.
//   → 이런 경우만 렌더러가 HTML 테두리 박스로 그린다. 진짜 수식 박스(\boxed{x+1})는 KaTeX 유지.
const BOXED_LABEL_RE = /^\\(?:boxed|fbox)\s*\{\s*([\s\S]*?)\s*\}$/;
// KaTeX metrics 없는 글자군: 원문자 한글(㉠~), 괄호한글(㈀~), 원숫자(①~), 괄호숫자(⑴~),
//   원영문(ⓐ~/Ⓐ~), 자모(ㄱ~ㅎ), 한글 음절(가~힣), 공백.
const NO_METRICS_LABEL_RE = /^[\s㉠-㉿㈀-㈜①-⑳⑴-⒇ⓐ-ⓩⒶ-Ⓩㄱ-ㅎ가-힣]*$/;

/** 전체가 \boxed{빈칸 라벨} 이면 라벨 반환, 아니면 null(→ KaTeX 로 렌더). */
export function matchBoxedLabel(mathValue: string): { label: string } | null {
  const m = mathValue.trim().match(BOXED_LABEL_RE);
  if (!m) return null;
  const inner = m[1].trim();
  if (inner === '' || NO_METRICS_LABEL_RE.test(inner)) return { label: inner };
  return null;
}

// ★ 보기 박스 라벨 항목 분리 (2026-07-24) — "ㄱ. …", "①. …", "(가) …" 처럼 라벨로 시작하는
//   항목들을 각각 떼어낸다. cases(연립방정식) 여러 개가 세로로 촘촘히 쌓이면 답답해서
//   원본 시험지처럼 가로 2열 그리드로 배치하기 위함(사용자 요청). 라벨 없는 줄은 직전 항목에 이어붙임.
//   라벨: 자모(ㄱ-ㅎ) / 원숫자(①-⑳) / 원문자한글(㉠-㉿) / (가)~(하). 뒤에 . 또는 ) .
//   원숫자(①)·원문자한글(㉠)·(가)는 그 자체가 라벨(뒤 구두점 불필요), 자모(ㄱ)는 뒤에 .·) 필요.
const ITEM_LABEL_RE = /^(?:[①-⑳]|[㉠-㉿]|\([가-힣]\)|[ㄱ-ㅎ]\s*[.)])/;

/**
 * 라벨로 시작하는 항목 리스트면 항목별 문자열 배열 반환, 아니면 null.
 * null 이면 호출측은 기존(세로 흐름) 렌더로 폴백 — 회귀 0.
 */
export function splitLabeledBoxItems(content: string): string[] | null {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    if (ITEM_LABEL_RE.test(line)) items.push(line);
    else if (items.length) items[items.length - 1] += '\n' + line; // 이어지는 줄
    else return null; // 첫 줄부터 라벨이 아님 → 라벨 리스트 아님(텍스트 조건 박스 등)
  }
  return items.length >= 2 ? items : null;
}

// ★ 테두리/조건 박스(isChoiceTabular) → 각 조건 줄로 변환. 실제 렌더 경로 = 이 함수(테스트도 이걸 직접 호출).
//   중첩 행렬/cases 는 MTX 마커로 보호 후 복원(동인고 #16). 복원 정규식은 [0-9]+ — '\\d' 이스케이프 함정 회피.
export function convertChoiceTabularBox(m: string): string {
  // ★ 중첩 수식 환경(matrix/cases/aligned) 보호 — 박스 안 행렬의 & · \ 가 셀구분·줄바꿈 변환에
  //   파괴되면 행렬이 통째 깨짐(동인고 #16: (가)(나) 조건의 $A\left(\begin{matrix}...\right)$). 끝에 복원.
  const MTX = String.fromCharCode(1);
  const nestedEnvs: string[] = [];
  const mProtected = m.replace(
    /\\begin\{((?:p|b|v|B|V)?matrix|cases|aligned)\}[\s\S]*?\\end\{\1\}/g,
    (env) => { nestedEnvs.push(env); return MTX + (nestedEnvs.length - 1) + MTX; }
  );
  // tabular → 각 보기를 개별 줄로 변환
  let converted = mProtected
    .replace(/\\begin\{(?:tabular|array)\}(?:\{[^}]*\})?/, '') // 시작 태그 제거
    .replace(/\\end\{(?:tabular|array)\}/, '')                  // 끝 태그 제거
    // ★ 테두리 조건박스({|c|}+\hline)도 isChoiceTabular 로 올 수 있음(#390 이후) — \hline 안 빼면
    //   변환 결과에 raw "\hline" 노출(예문여고 #16). 풀이박스 경로(line 255)와 동일하게 제거.
    .replace(/\\hline\s*/g, ' ')
    .replace(/\s*###\s*/g, ' ')                                 // ### → 공백
    .replace(/\s*\\\\\s*/g, '\n')                               // \\ → 줄바꿈 (공백 아님!)
    .replace(/\s*&\s*/g, ' ')                                   // & → 공백
    .replace(/<?\s*보기\s*>?\s*/g, '')                          // <보기> 잔여 제거
    .replace(/\\quad\s*/g, ' ')                                 // \quad → 공백
    .trim();
  // ★ 1단계: \text{...} 래퍼 벗기기 (내용만 추출)
  converted = converted.replace(/\\text\s*\{([^}]*)\}/g, '$1');
  // ★ 2단계: 가./나./다./라./마. → ㄱ./ㄴ./ㄷ./ㄹ./ㅁ.
  //   ★ 음수 룩비하인드 (?<![가-힣A-Za-z0-9(（]) 필수:
  //     - 문장 끝 "…이다." "…가진다." 의 "다." 를 라벨로 오인 금지(유령 ㄷ. + 잘림, 예문여고 #16/#409).
  //     - ★ "(" "（" 도 제외 — 원본이 괄호 음절 라벨 `(가) (나) (다)` 이면 그대로 보존해야 함.
  //       (안 막으면 "(가)"→"(ㄱ)" 로 바꾸고 line 299 가 "("+"ㄱ)" 로 쪼개 단독 "(" 노출. 예문여고 #16 원본=괄호형)
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])가\s*([.)])/g, 'ㄱ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])나\s*([.)])/g, 'ㄴ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])다\s*([.)])/g, 'ㄷ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])라\s*([.)])/g, 'ㄹ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])마\s*([.)])/g, 'ㅁ$1');
  // 마침표 없는 가/나/다 단독 → ㄱ/ㄴ/ㄷ (뒤에 수식이 바로 오는 경우)
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])가(?=\s*[\$y\\])/g, 'ㄱ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])나(?=\s*[\$y\\])/g, 'ㄴ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])다(?=\s*[\$y\\])/g, 'ㄷ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])라(?=\s*[\$y\\])/g, 'ㄹ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])마(?=\s*[\$y\\])/g, 'ㅁ.');
  // OCR 오인: c. → ㄷ.
  converted = converted.replace(/\bc\s*([.)])/g, 'ㄷ$1');
  // 각 보기 라벨 앞에 줄바꿈 → 개별 줄로 분리
  converted = converted.replace(/([ㄱㄴㄷㄹㅁ])\s*([.)])/g, '\n$1$2');
  // ★ 단독 "(" / ")" 줄 제거 — 테두리 박스의 \hline 옆 OCR 잔재가 단독 괄호로 남아
  //   각 조건 앞·박스 위에 "(" 한 글자로 노출되던 사고(예문여고 #16). 줄 전체가 괄호 1개뿐일 때만.
  converted = converted.replace(/(^|\n)[ \t]*[\(（\)）][ \t]*(?=\n|$)/g, '$1');
  converted = converted.replace(/\n{2,}/g, '\n');
  // 보호한 중첩 수식 환경 복원(MTX 마커 → 원본 행렬/cases)
  converted = converted.replace(new RegExp(MTX + '([0-9]+)' + MTX, 'g'), (_m, ix) => nestedEnvs[Number(ix)] || '');
  return '\n' + converted.trim() + '\n';
}

const BOX_HEADER_KEYWORDS = ['보기', '규칙', '조건', '참고', '자료', '안내', '주의', '정의', '설명'];

function detectBoxHeaderLabel(trimmed: string): string | null {
  // 1) `< X >` 또는 `〈 X 〉` 단독 라인 (장식 문자 _, -, ─, —, =, $, \, . 가능)
  const angleMatch = trimmed.match(
    /^\s*(?:[$_\\\-─—=.\s]{2,}\s*)?[<〈]\s*([가-힣\s]+?)\s*[>〉]\s*(?:[$_\\\-─—=.\s]{2,})?\s*$/,
  );
  if (angleMatch) {
    const inner = angleMatch[1].replace(/\s+/g, '');
    if (BOX_HEADER_KEYWORDS.includes(inner)) return inner;
  }
  // 2) `| 보 기 |` 형식 (Mathpix가 가로 테두리를 파이프로 출력하는 케이스)
  const pipeMatch = trimmed.match(/^\s*\|\s*([가-힣\s]+?)\s*\|\s*$/);
  if (pipeMatch) {
    const inner = pipeMatch[1].replace(/\s+/g, '');
    if (BOX_HEADER_KEYWORDS.includes(inner)) return inner;
  }
  return null;
}

export function extractConditionBoxes(text: string): { mainContent: string; conditionBoxes: string[]; conditionHeaderLabels: (string | null)[] } {
  const lines = text.split('\n');
  const conditionBoxes: string[] = [];
  const conditionHeaderLabels: (string | null)[] = []; // ★ 박스 헤더 라벨 (보기/규칙/조건/...) — null 이면 헤더 없음
  const mainLines: string[] = [];

  // (가)/(나)/(다) 또는 <보기>/<규칙>/<조건> 블록 감지
  let inConditionBlock = false;
  let conditionLines: string[] = [];
  let currentHeaderLabel: string | null = null;
  let boxIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 조건 시작: (가), (나), (다), <보기>/<규칙>/<조건>/..., | 보 기 |, ㄱ., ㄴ., ㄷ.
    // ★ \displaystyle이 앞에 붙어있을 수 있으므로 선택적으로 매칭
    // ★ 박스 헤더: 단독 줄에 있는 경우만 (문장 중간 <조건>은 무시)
    // ★ 장식 문자: _, -, ─, —, =, $, \, . (Mathpix가 $\_\_\_\_$ 형식으로 출력)
    const boxHeaderLabel = detectBoxHeaderLabel(trimmed);
    const isBoxHeader = boxHeaderLabel !== null;
    const isConditionStart = /^\s*[\(（]\s*[가나다라마]\s*[\)）]/.test(trimmed) ||
                             isBoxHeader ||
                             /^\s*(?:\\displaystyle\s*)?[ㄱㄴㄷㄹㅁ]\s*[.)]/.test(trimmed);

    if (isConditionStart && !inConditionBlock) {
      inConditionBlock = true;
      currentHeaderLabel = boxHeaderLabel;
      // ★ 박스 헤더 줄 자체는 제외 (렌더링 시 별도 헤더로 표시)
      if (isBoxHeader) {
        conditionLines = [];
      } else {
        conditionLines = [lines[i]];
      }
      continue;
    }

    if (inConditionBlock) {
      // ★ 조건 라벨: (나)(다), ㄴ.ㄷ. → 무조건 조건 계속
      const isConditionLabel = /^\s*[\(（]\s*[나다라마]\s*[\)）]/.test(trimmed) ||
                               /^\s*(?:\\displaystyle\s*)?[ㄴㄷㄹㅁ]\s*[.)]/.test(trimmed);
      // ★ 조건 부연설명: (단, ...), 여기서/이때 등
      const isConditionNote = /^\s*[\(（]\s*단/.test(trimmed) ||
                              /^\s*여기서|^\s*이때|^\s*단,/.test(trimmed);

      if (isConditionLabel || isConditionNote) {
        conditionLines.push(lines[i]);
        continue;
      }

      // ★ 박스 종료 조건: 선택지, 문제번호, 질문 문장, 빈 줄
      const isBlockEnd = /^\s*[①②③④⑤]/.test(trimmed) ||
                         /^\s*\(\s*[1-5]\s*\)/.test(trimmed) ||
                         /^\s*\d+\s*[.)]\s/.test(trimmed) ||
                         /것은\s*\?|고르시오|구하시오|구하여라|구하라|푸시오|쓰시오|그리시오|나타내시오|작성하시오|서술하시오|증명하시오|보이시오|답하시오|고른\s*것|옳은\s*것|있는\s*대로|만을\s*고|보기.*고른|에서.*옳/.test(trimmed) ||
                         trimmed === '';
      if (isBlockEnd) {
        if (conditionLines.length > 0) {
          conditionBoxes.push(conditionLines.join('\n'));
          conditionHeaderLabels.push(currentHeaderLabel);
          mainLines.push(`__CONDITION_BOX_${boxIndex}__`);
          boxIndex++;
        }
        inConditionBlock = false;
        conditionLines = [];
        currentHeaderLabel = null;
        if (trimmed !== '') mainLines.push(lines[i]);
        continue;
      }
      // ㄱ/ㄴ/ㄷ 내용이 여러 줄이면 계속 수집
      conditionLines.push(lines[i]);
      continue;
    }

    mainLines.push(lines[i]);
  }

  // 마지막 조건 블록 처리
  if (inConditionBlock && conditionLines.length > 0) {
    conditionBoxes.push(conditionLines.join('\n'));
    conditionHeaderLabels.push(currentHeaderLabel);
    mainLines.push(`__CONDITION_BOX_${boxIndex}__`);
  }

  return { mainContent: mainLines.join('\n'), conditionBoxes, conditionHeaderLabels };
}

// 박스 분류 — 풀이박스 vs 보기형(조건) vs 일반. 실제 렌더 경로 = 이 함수(테스트도 직접 호출).
//   ★ 행렬(matrix류)은 풀이박스 신호 아님 — (가)(나)(다) 조건박스 안 행렬(열벡터 포함)이
//     풀이박스로 빠져 깨지던 사고(부산중앙여고 #22). aligned/array/cases/줄간격만 풀이박스 신호.
export function classifyTabularBlock(m: string): { looksLikeSolutionBox: boolean; isChoiceTabular: boolean } {
const colSpecMatch = m.match(/\\begin\{(?:tabular|array)\}\s*\{([^}]*)\}/);
const colSpec = colSpecMatch?.[1] || '';
const hasAlignedInside = /\\begin\{aligned\}/i.test(m);
// ★ 다열 데이터 표(테두리 있는 진짜 표, 예: {|l|l|l|l|} + \hline)는 풀이박스가 아님 (화명중 #1
//   "글자와 줄만 나옴" 사고: 데이터 표를 풀이박스로 오인해 테두리를 떼어내 격자 없는 표로 렌더됨).
//   풀이박스는 보통 단일 컬럼({|l|}). 컬럼 2개 이상이거나 행에 & 가 있으면 데이터 표로 보고
//   테두리 유지(parseTabularBlock 이 |·\hline → CSS 격자로 렌더, KaTeX 미사용이라 안전).
//   nested \begin{aligned} 풀이는 컬럼수와 무관하게 풀이박스로 유지.
const colCount = (colSpec.match(/[clr]/gi) || []).length;
const isMultiColumnTable = colCount >= 2 || /&/.test(m);
// ★ 풀이박스 판정 정밀화 — 단일 컬럼이라도 "단순 데이터 박스"(셀이 짧은 $…$/텍스트, 중첩환경 없음)면
//   테두리 유지(데이터 표 경로 = parseTabularBlock CSS 격자). 복잡 환경(중첩 aligned/array/cases/
//   matrix, \\[Npt] 행간)만 KaTeX 친화 위해 테두리 제거(풀이박스). 거제여중 #18 버스 요금 1열 박스가
//   테두리 없이 3줄로만 렌더되던 것 → 테두리 박스로. 셀 본문만 검사(박스 자신의 begin 태그 제외).
const innerBody = m
  .replace(/^\s*\\begin\{(?:tabular|array)\}(?:\s*\{[^}]*\})?/i, '')
  .replace(/\\end\{(?:tabular|array)\}\s*$/i, '');
const hasComplexEnv = hasAlignedInside
  || /\\begin\{(?:array|cases|aligned)\}/i.test(innerBody)
  || /\\\\\s*\[/.test(innerBody);
const looksLikeSolutionBox = hasAlignedInside || (!isMultiColumnTable && hasComplexEnv);

// boxed 안의 (가)/(나) placeholder 제거 후 라벨 카운트
//   \boxed{\text{(가)}} 의 (가) 는 placeholder 라 셀의 보기 라벨과 의미 다름
const stripped = m.replace(/\\boxed\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');

// 보기형 tabular 감지: ㄱ./ㄴ. 또는 가./나. 또는 \text{가.} 또는 (가)/(나) 패턴
//   ★ boxed 제거된 stripped 에서 검사 — placeholder 오탐 차단
const hasJamoLabels = /[ㄱㄴㄷㄹㅁ]\s*[.)]/.test(stripped);
// ★ 보기 라벨 "가./나./다."만 — 문장 끝 "…이다." "…것이다."의 "다."를 오인하면 조건박스가
//   isChoiceTabular 로 잘못 변환돼 "ㄷ." 라벨 + \hline 노출 사고(온천중 #5). 앞에 한글음절/영문/숫자가
//   오면(=문장 중간) 제외 — 진짜 라벨은 줄/셀 시작(공백·\\·& 뒤)이라 통과.
const hasGanaLabels = /(?<![가-힣A-Za-z0-9])[가나다라마]\s*[.)]/.test(stripped);
const hasTextGanaLabels = /\\text\s*\{\s*[가나다라마]\s*[.)]?\s*\}/.test(stripped);
const hasParenLabels = /[\(（]\s*[가나다라마]\s*[\)）]/.test(stripped);

const isChoiceTabular =
  !looksLikeSolutionBox &&
  (hasJamoLabels || hasGanaLabels || hasTextGanaLabels || hasParenLabels);

  return { looksLikeSolutionBox, isChoiceTabular };
}

