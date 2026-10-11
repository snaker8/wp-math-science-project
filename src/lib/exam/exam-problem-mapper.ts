// ============================================================================
// DB 행 → ExamProblemData 매핑 (순수 모듈, 서버·클라이언트 공용)
//
// ★ 2026-10-12: useExamProblems('use client')에서 분리. 학부모 공유 리포트(share/exam, 서버 컴포넌트)가 고난도 문항을
//   실제 문제로 그릴 때 같은 매핑을 써야 하는데, 'use client' 모듈의 함수는 서버에서 호출하면 클라이언트 참조라 터진다
//   (hardProblems 가 조용히 비던 사고). 로직은 그대로 옮겼다 — 화면·인쇄·리포트가 한 매핑을 쓴다.
// ============================================================================

import { stripTrailingInlineChoices } from '@/lib/utils/strip-inline-choices';
import { cleanLatexContent, cleanChoiceText } from '@/lib/utils/clean-latex';

// ============================================================================
// Types - 시험지에 연결된 문제 데이터
// ============================================================================

export interface ExamProblemData {
  id: string;
  number: number;
  /** ★ 시험지에 적용된 배점 (exam_problems.points) — 원본 OCR에서 추출됐거나 자동 분배·수동 지정됨 */
  points?: number;
  difficulty: number; // 수학비서 기준 1~10
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  content: string;
  choices: string[];
  /** ★ 그림 객관식: 선택지별 이미지 URL. choices와 인덱스 정렬. null = 텍스트 옵션 */
  choiceImages?: (string | null)[];
  /** ★ 표 형식 선택지 열 헤더 (예: ["ㄱ","ㄴ","ㄷ","ㄹ"]) */
  choiceHeaders?: string[];
  /** ★ 저장된 선택지 레이아웃 (1=1열, 2=2열, 5=가로) */
  choiceLayout?: number;
  answer: number | string;
  /** ★ 원본 answer_json 전체 (수정 모달에서 보존용) */
  answerJson?: Record<string, unknown>;
  solution: string;
  year: string;
  typeCode: string;
  typeName: string;
  source: string;
  images?: Array<{ url: string; type: string; label: string }>;
  hasFigure?: boolean;
  figureSvg?: string;
  figureData?: import('@/types/ocr').InterpretedFigure;
  /** ★ 업스케일된 크롭 이미지 URL */
  upscaledCropUrl?: string;
  /** 도형 소스: 'upscaled_crop' = 업스케일 원본 사용, 'ai_generated' 등 */
  figureSource?: 'upscaled_crop' | 'ai_generated' | 'ai_image';
}

export interface ExamInfo {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  examType: string | null;
  status: string;
  problemCount: number;
  createdAt: string;
}

// ============================================================================
// Type Code 표시용 변환
// MA-HS0-POL-01-003 → POL-01-003 (영역-성취기준-순번)
// ============================================================================

export function formatDisplayTypeCode(rawCode: string): string {
  if (!rawCode) return '';
  // 이미 짧은 형식이면 그대로 (A001, POL-01-003 등)
  if (!rawCode.startsWith('MA-')) return rawCode;
  // MA-{LEVEL}-{DOMAIN}-{STD}-{SEQ} → {DOMAIN}-{STD}-{SEQ}
  const parts = rawCode.split('-');
  if (parts.length >= 5) {
    return parts.slice(2).join('-'); // POL-01-003
  }
  return rawCode;
}

// ============================================================================
// source_name에서 학교명/연도 파싱
// "2025학년 경남고1 공통수학1 1학기 중간.pdf" → { school: "경남고", year: "2025" }
// ============================================================================

export function parseSourceName(sourceName: string): { school: string; year: string } {
  if (!sourceName) return { school: '', year: '' };

  // 연도 추출: "2025학년" 또는 "2025" 패턴
  const yearMatch = sourceName.match(/(20\d{2})/);
  const year = yearMatch ? yearMatch[1] : '';

  // 학교명 추출: "경남고1", "용인고", "서울고2" 등 → 학교명만
  // 패턴: 2~4글자 한글 + "고" 또는 "중" 또는 "초"
  const schoolMatch = sourceName.match(/([가-힣]{1,6}(?:고|중|초))\d*/);
  const school = schoolMatch ? schoolMatch[1] : '';

  // 학교명을 못 찾으면 .pdf 확장자와 연도 제거 후 첫 토큰 사용
  if (!school) {
    const cleaned = sourceName.replace(/\.pdf$/i, '').replace(/20\d{2}학년?\s*/, '').trim();
    const firstToken = cleaned.split(/\s+/)[0];
    return { school: firstToken || sourceName.replace(/\.pdf$/i, ''), year };
  }

  return { school, year };
}

// ============================================================================
// LaTeX에서 선택지 추출
// ============================================================================

export function extractChoicesFromLatex(latex: string): { content: string; choices: string[] } {
  let mainContent = latex;
  const choices: string[] = [];

  // 1차: ①~⑤ 패턴 시도
  const circledMarkers = ['①', '②', '③', '④', '⑤'];
  const firstCircledIdx = latex.indexOf('①');
  if (firstCircledIdx !== -1) {
    mainContent = latex.substring(0, firstCircledIdx).trim();
    const remaining = latex.substring(firstCircledIdx);

    for (let i = 0; i < circledMarkers.length; i++) {
      const marker = circledMarkers[i];
      const nextMarker = circledMarkers[i + 1];
      const startIdx = remaining.indexOf(marker);
      if (startIdx === -1) continue;

      let endIdx = nextMarker ? remaining.indexOf(nextMarker) : remaining.length;
      if (endIdx === -1) endIdx = remaining.length;

      const choiceText = remaining.substring(startIdx, endIdx).trim();
      if (choiceText) choices.push(choiceText);
    }

    mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();
    return { content: mainContent, choices };
  }

  // 2차: (1)~(5) 패턴은 ★ 항상 서술형 소문제로 간주한다 ★
  //   - 객관식 보기는 반드시 ①②③④⑤ 원문자로만 표기되도록 OCR/정규화 단계에서 처리됨
  //   - (1)(2)... 는 본문에 그대로 두고 분리하지 않음 → 모달/화면 모두 서술형으로 인식
  //   - 흡수/객관식오인식 사고를 원천 차단
  if (latex.indexOf('(1)') !== -1) {
    mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();
    return { content: mainContent, choices: [] };
  }

  // (객관식 (1)(2)... 분리 로직은 더 이상 사용하지 않음 — 위 if문이 모든 (1) 케이스를 잡음)
  const firstNumberedIdx = -1; // 도달 불가, 아래 블록 dead code
  if (firstNumberedIdx !== -1) {
    const remaining = latex.substring(firstNumberedIdx);

    // ★ 소문제 판별: "구하시오", "구하여라", "[N점]" 등이 있으면 소문제 → 분리하지 않음
    const subProblemPatterns = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이과정|\[\s*\d+\s*점\s*\]/;
    if (!subProblemPatterns.test(remaining)) {
      const numberedMarkers = ['(1)', '(2)', '(3)', '(4)', '(5)'];
      mainContent = latex.substring(0, firstNumberedIdx).trim();

      for (let i = 0; i < numberedMarkers.length; i++) {
        const marker = numberedMarkers[i];
        const nextMarker = numberedMarkers[i + 1];
        const startIdx = remaining.indexOf(marker);
        if (startIdx === -1) continue;

        let endIdx = nextMarker ? remaining.indexOf(nextMarker) : remaining.length;
        if (endIdx === -1) endIdx = remaining.length;

        let choiceText = remaining.substring(startIdx, endIdx).trim();
        // (1) → ① 변환
        choiceText = choiceText.replace(/^\((\d)\)/, (_, num) => circledMarkers[parseInt(num) - 1] || `(${num})`);
        if (choiceText) choices.push(choiceText);
      }

      mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();
      return { content: mainContent, choices };
    }
  }

  // $ 기호로 감싸진 수학식 정리
  mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();

  return { content: mainContent, choices };
}

// ============================================================================
// 본문 끝의 인라인 보기 블록 제거 (중복 방지)
// ============================================================================
//
// ★ 2026-06-02 사고: 일부 자산화 데이터(예: 6/1 자산화 시험지)는 content_latex "끝"에
//   보기(① 4 ② 5 ③ 6 ④ 7 ⑤ 8)가 그대로 들어있고, answer_json.choices 에도 같은 보기가 있다.
//   hasDbChoices 경로는 본문 cut 사고(2026-05-25) 회피 위해 fullContent 를 그대로 쓰므로,
//   "본문(인라인 보기 포함) + 보기 그리드" 가 둘 다 렌더 → 보기가 화면에 중복으로 보임.
//
// 안전 원칙:
//   - dbChoices 와 본문 "끝 블록" 이 실제로 일치할 때만 그 끝 블록을 제거한다(보기 그리드는 유지).
//   - 마커 위치는 lastIndexOf 로 "맨 끝 런" 을 역추적 → 본문 중간의 ①(표·설명·보기 아닌 것)은
//     보존. 텍스트가 dbChoices 와 안 맞으면(표 셀 등) 과반 미달로 절대 자르지 않는다.
//   - 질문(head)이 거의 없으면(전체가 보기뿐) 위험하므로 패스.
// ★ stripTrailingInlineChoices 는 '@/lib/utils/strip-inline-choices' 로 이동 (한글 내보내기와 공용, 2026-10-08)
// ============================================================================
// answer_json에서 정답 번호 추출
// ============================================================================

/** ①~⑤ → 1~5 매핑 */
const CIRCLED_TO_NUM: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
/** 1~5 → ①~⑤ */
const NUM_TO_CIRCLED = ['', '①', '②', '③', '④', '⑤'];

/**
 * 복수정답("모두 고르기"형) 감지 — 원형숫자가 2개 이상이면 정렬·중복제거한 "③④" 반환, 아니면 ''.
 * ★ 원형숫자(①~⑤)만 신뢰 — 주관식 답("3, 4" 같은 값 나열)을 객관식 복수정답으로 오인하지 않도록
 *   숫자+쉼표 형식은 여기서 다루지 않는다(그 형식은 기존대로 문자열로 통과). 단일은 '' → 기존 경로 유지.
 */
export function toMultiCircledKey(s: string): string {
  const circled = s.match(/[①②③④⑤]/g);
  if (!circled || circled.length < 2) return '';
  const uniq = Array.from(new Set(circled.map((c) => CIRCLED_TO_NUM[c])))
    .filter((n) => n >= 1 && n <= 5)
    .sort((a, b) => a - b);
  return uniq.length >= 2 ? uniq.map((n) => NUM_TO_CIRCLED[n]).join('') : '';
}

export function extractAnswerNumber(answerJson: Record<string, unknown>): number | string {
  // 다양한 포맷 지원 (우선순위 순)
  const candidates = ['correct_answer', 'finalAnswer', 'answer', 'value'];
  for (const key of candidates) {
    if (answerJson[key] !== undefined && answerJson[key] !== null && answerJson[key] !== '') {
      const ans = answerJson[key];
      if (typeof ans === 'number') {
        // 1~5 → 객관식 번호, 그 외 정수는 주관식 정답
        return ans;
      }
      if (typeof ans === 'string' && ans.trim()) {
        const trimmed = ans.trim();
        // ★ 복수정답("모두 고르기"형): "③④" / "③, ④" → 정렬된 "③④" 문자열 보존.
        //   (단일정답은 '' 반환 → 아래 기존 경로 그대로 — 동작 불변)
        const multi = toMultiCircledKey(trimmed);
        if (multi) return multi;
        // ★ ①~⑤로 시작하면 객관식 답번호 추출 (선택지 텍스트 포함 시)
        const firstChar = trimmed.charAt(0);
        if (CIRCLED_TO_NUM[firstChar]) return CIRCLED_TO_NUM[firstChar];
        // 순수 정수 문자열 → 숫자 반환
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && String(num) === trimmed) return num;
        // 그 외 문자열 (수식 등) 그대로 반환
        return trimmed;
      }
    }
  }
  if (answerJson.values !== undefined) return String(answerJson.values);

  return '-';
}

// ============================================================================
// DB 행 → ExamProblemData 변환
// ============================================================================

export function toExamProblemData(
  row: any,
  index: number,
): ExamProblemData {
  const problem = row.problems || row;
  const classification = Array.isArray(problem.classifications)
    ? problem.classifications[0]
    : problem.classifications;

  // ★ 1순위: answer_json.choices (자산화 시 별도 저장된 선택지)
  const answerJson = problem.answer_json || {};
  const dbChoices: string[] = Array.isArray(answerJson.choices) ? answerJson.choices : [];
  // ★ 표 형식 선택지 헤더 (예: ["ㄱ","ㄴ","ㄷ","ㄹ"])
  const choiceHeaders: string[] | undefined = Array.isArray(answerJson.choiceHeaders) ? answerJson.choiceHeaders : undefined;
  // ★ 저장된 선택지 레이아웃 (1=1열, 2=2열, 5=가로)
  const choiceLayout: number | undefined = typeof answerJson.choiceLayout === 'number' ? answerJson.choiceLayout : undefined;
  // ★ 그림 객관식: 선택지별 이미지 URL (choices 인덱스 정렬, null = 텍스트 옵션)
  const choiceImages: (string | null)[] | undefined = Array.isArray(answerJson.choiceImages)
    ? answerJson.choiceImages.map((v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null))
    : undefined;

  // ★ 2순위: content_latex에서 추출 (fallback)
  //   ★ 본문 cut 방지 (2026-05-25 사고 fix):
  //     DB 에 choices 가 박혀있으면 본문에서 ①~⑤ 추출 (cut) 하지 않음 — 본문 전체 사용.
  //     extractChoicesFromLatex 는 본문에 첫 ① 만나면 그 앞까지만 content 로 자르는데,
  //     본문 안 표 환경 (`\begin{tabular}` 안 ① 라벨) 이나 본문 설명에 ①~⑤ 가 있으면
  //     content 가 매우 짧게 cut됨 (사용자 보고: "문제가 안 나온다").
  //     DB choices 가 있으면 그 추출이 무의미 + 본문 부당하게 짤림 → 본문 전체 사용.
  const fullContent = problem.content_latex || '';
  const { content: extractedContent, choices: extractedChoices } = extractChoicesFromLatex(fullContent);
  const hasDbChoices = dbChoices.length > 0;
  // ★ 서답형(short_answer) 가드 (2026-06-02): DB choices 가 없을 때 본문에서 ①~⑤를 객관식
  //   보기로 추출하던 fallback 이, 서답형 문제의 "풀이 단계(①②③…)" 를 객관식 보기로 오인해
  //   choices 에 채워 넣던 사고(서답형 19·21번: 단계가 객관식 보기/소문제 표로 붙음).
  //   ① 분기(extractChoicesFromLatex)엔 (1)(2) 분기와 달리 서답형 가드가 없었음.
  //   → 서답형이면 추출 금지(choices 비움) + 본문 전체 유지(①②③ 단계가 content 에 그대로 남음).
  const isShortAnswer = answerJson.type === 'short_answer';
  // ★ LaTeX 정리 (공통 유틸 — 모든 페이지에 자동 적용)
  //   hasDbChoices: 본문 전체 사용(2026-05-25 cut 방지) 하되, 본문 끝에 보기가 인라인으로
  //     중복돼 있으면(자산화 데이터) 그 끝 블록만 제거 → "본문 보기 + 보기 그리드" 중복 해소.
  //     (dbChoices 와 실제 일치할 때만 제거 — 본문 중간 ① 표·설명은 보존)
  const content = cleanLatexContent(
    hasDbChoices
      ? stripTrailingInlineChoices(fullContent, dbChoices)
      : (isShortAnswer ? fullContent : extractedContent),
  );

  // DB choices 가 있으면 우선 사용. 없고 서답형이면 빈 배열(추출 금지), 객관식이면 본문 추출 fallback.
  const rawChoices = hasDbChoices ? dbChoices : (isShortAnswer ? [] : extractedChoices);
  const choices = rawChoices.map(c => cleanChoiceText(c));

  // type_code → 표시용 짧은 코드 변환
  // MA-HS0-POL-01-003 → POL-01-003, 이미 짧으면 그대로
  const rawTypeCode = classification?.type_code || '';
  const typeCode = formatDisplayTypeCode(rawTypeCode);

  // typeName: 1순위 classifications.type_name (DB 조회), 2순위 ai_analysis
  let typeName = '';
  // ★ 1순위: API에서 expanded_math_types 조인한 type_name
  if (classification?.type_name) {
    typeName = classification.type_name;
  }
  // ★ 2순위: ai_analysis에서 추출
  if (!typeName) {
    const aiClass = problem.ai_analysis?.classification;
    if (aiClass?.typeName && aiClass.typeName !== rawTypeCode) {
      typeName = aiClass.typeName;
    }
  }
  // 3순위: typeName 없으면 빈 문자열 유지 (typeCode와 중복 표시 방지)
  // UI에서 typeCode만 표시, typeName이 있을 때만 ". typeName" 추가

  // source_name에서 학교명/연도 파싱
  const sourceName = problem.source_name || '';
  const parsed = parseSourceName(sourceName);
  const displayYear = problem.source_year ? String(problem.source_year) : parsed.year;
  const displaySource = parsed.school || sourceName.replace(/\.pdf$/i, '');

  // images 배열 (크롭 이미지 등)
  const rawImages = problem.images;
  const images: Array<{ url: string; type: string; label: string }> = Array.isArray(rawImages) ? rawImages : [];

  // 도형 포함 여부 + AI 생성 SVG + 구조화된 도형 데이터 (ai_analysis에서 추출)
  const hasFigure = problem.ai_analysis?.hasFigure || false;
  const figureSvg = problem.ai_analysis?.figureSvg || undefined;
  const figureData = problem.ai_analysis?.figureData || undefined;
  // ★ 업스케일된 크롭 이미지 (원본이 쓸만할 때 AI 없이 사용)
  const upscaledCropUrl = problem.ai_analysis?.upscaledCropUrl || undefined;
  const figureSource = problem.ai_analysis?.figureSource || undefined;


  return {
    id: problem.id,
    number: problem.source_number ?? row.sequence_number ?? row.order_index ?? (index + 1),
    // ★ NUMERIC(4,2) 컬럼은 supabase-js가 string으로 반환할 수 있어 Number() 변환
    points: row.points != null ? Number(row.points) : undefined,
    difficulty: classification
      ? Math.min(10, Math.max(1, parseInt(classification.difficulty, 10) || 3))
      : 3,
    cognitiveDomain: classification?.cognitive_domain || 'UNDERSTANDING',
    content,
    choices,
    choiceHeaders,
    choiceLayout,
    choiceImages,
    answer: extractAnswerNumber(answerJson),
    answerJson: answerJson as Record<string, unknown>,
    solution: problem.solution_latex || '',
    year: displayYear,
    typeCode,
    typeName,
    source: displaySource,
    images,
    hasFigure,
    figureSvg,
    figureData,
    upscaledCropUrl,
    figureSource,
  };
}

