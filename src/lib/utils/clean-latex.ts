/**
 * LaTeX 콘텐츠 정리 유틸리티
 * KaTeX 렌더링 호환성을 위한 전처리
 * 모든 페이지에서 공통으로 사용
 */

export function cleanLatexContent(content: string): string {
  let result = content
    // 마크다운 이미지 → [도형] 마커
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[도형]')
    // \displaystyle 제거
    .replace(/\\displaystyle\s*/g, '')
    // \lbrace → \left\{ , \rbrace → \right\} (KaTeX 호환)
    .replace(/\\lbrace/g, '\\left\\{')
    .replace(/\\rbrace/g, '\\right\\}');

  // ★ \[ ... \] (display math 구분자, Mathpix/AMS 표준) → $$ ... $$
  //   downstream MixedContentRenderer 도 같은 변환을 하지만 splitAtQuestion 등
  //   `$$` 기준으로 동작하는 호출자가 있어서 진입 시점에 통일.
  //   (예: 신곡중 13번 `\[\begin{array}{l}...\end{array}\]` 가 빨간 raw 로 표시되던 버그)
  //   ※ 단일 $ 안의 환경 자동 승격은 위험 — clean-latex 가 만든 `$\begin{cases}...\end{cases}$`
  //     같은 정상 콘텐츠를 깨뜨릴 수 있어 추가하지 않는다. 필요한 경우 MixedContentRenderer
  //     phase 1-4 ($-balance 기반 판정)에서 처리.
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => `$$${inner.trim()}$$`);

  // ★ 본문 배점 표기 제거 (렌더링 시점만, DB 안 건드림)
  //   카드 헤더에 노란색 배점 배지가 별도로 표시되므로 본문의 (3점)/(3.4점)/[3점]/[총 5점] 은 중복.
  //   - 자산화 1차에 추출된 score 가 [N점] 으로 본문에 들어간 케이스
  //   - reocr-points 로 추출됐지만 본문 (N점) 가 그대로 남아있는 케이스
  //   - 서답형 묶음 헤더의 [총 N점] — 카드 헤더 배지로 대체되니 텍스트 중복 제거
  //   카드 표시에서만 가린다. (수식 내부 의미 있는 [..] 는 영향 없음 — N점 형태만 매칭)
  result = result.replace(/[\[(]\s*(?:총\s*)?\d+(?:\.\d+)?\s*점\s*[\])]/g, '').replace(/[ \t]{2,}/g, ' ');

  // ─── 연립방정식 괄호 패턴 수정 ───
  // OCR 출력: $\left\{$eq1$\n$eq2$\right.$ → KaTeX에서 $ 구분자 꼬임
  // 수정: $\begin{cases} eq1 \\ eq2 \end{cases}$

  // (a) 쌍 연립방정식: $\left\{$eq1$\n$eq2$,\left\{$eq3$\n$eq4$\right.\right.$
  const dfrac = (s: string) => s.trim().replace(/\\frac\b/g, '\\dfrac');
  result = result.replace(
    /\$\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\s*,\s*\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\\right\.\\right\.\$/g,
    (_m, eq1: string, eq2: string, eq3: string, eq4: string) =>
      `$\\begin{cases} ${dfrac(eq1)} \\\\ ${dfrac(eq2)} \\end{cases}$, $\\begin{cases} ${dfrac(eq3)} \\\\ ${dfrac(eq4)} \\end{cases}$`
  );

  // (b) 단일 연립방정식: $\left\{$eq1$\n$eq2$\right.$
  result = result.replace(
    /\$\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\\right\.\$/g,
    (_m, eq1: string, eq2: string) =>
      `$\\begin{cases} ${dfrac(eq1)} \\\\ ${dfrac(eq2)} \\end{cases}$`
  );

  // \begin{table}...\end{table} 래퍼 제거
  result = result
    .replace(/\\begin\{table\}[\s\S]*?(?=\\begin\{tabular\})/gi, '')
    .replace(/\\end\{tabular\}[\s\S]*?\\end\{table\}/gi, '\\end{tabular}');

  // tabular는 MixedContentRenderer가 자체 파싱하므로 여기서 변환하지 않음

  // \begin{aligned}...\end{aligned} → 줄별 $...$ 변환
  result = result.replace(/\$\$\s*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*\$\$/gi, (_match, inner) => {
    return inner
      .split('\\\\')
      .map((line: string) => line.replace(/&/g, '').trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => `$${line}$`)
      .join('\n');
  });

  return result.trim();
}

/**
 * ★ 서술형 소문제별 배점 인라인 주입
 * - answer_json.subQuestions 의 points 를 본문 소문제 표식 뒤에 [N점] 으로 박는다.
 * - 3가지 패턴 지원 (parseSubQuestions 분기와 동일 매핑):
 *   1) "N-M." / "N-M)" 라인 — 라인 끝에 [N점] 부착 (동백중 5-1./5-2.)
 *   2) "[서·논술형 N-M]" 대괄호 — 닫는 ] 직후에 [N점] 부착 (신도중)
 *   3) "[N-M]" 단순 대괄호 — 닫는 ] 직후에 [N점] 부착 (서·논술형 키워드 없는 케이스)
 * - cleanLatexContent 의 stripping 단계 이후에 호출해야 [N점] 이 다시 떼어지지 않음.
 * - 카드 화면(ProblemCardView)·시험지 출력(ExamProblemRenderer) 양쪽에서 일관 사용.
 *
 * Why: 카드 SubQuestionTable 에 입력한 소문제별 점수가 실제 본문/시험지 출력에는
 *      반영되지 않던 사고 (동백중 2-1 [서논술형 5/6], 19-21번 [3-1][3-2] 형식).
 */
export function injectSubQuestionPoints(
  content: string,
  subQuestions: Array<{ number: string; points: number | null }> | undefined | null
): string {
  if (!subQuestions || subQuestions.length === 0) return content;
  let result = content;
  for (const sq of subQuestions) {
    if (sq.points == null || !Number.isFinite(sq.points as number)) continue;
    const num = String(sq.number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ptsLabel = `[${sq.points}점]`;
    const escLabel = ptsLabel.replace(/[\[\]]/g, '\\$&');
    // 이미 같은 [N점] 표기가 그 영역에 있으면 skip (중복 방지)
    const dupDot = new RegExp(`(^|\\n)\\s*${num}\\s*[.．)][^\\n]*${escLabel}`, 'm');
    const dupBracket = new RegExp(`\\[[^\\]]*${num}\\s*\\][^\\n]*?${escLabel}`, 'm');
    if (dupDot.test(result) || dupBracket.test(result)) continue;
    // 1) "N-M." 또는 "N-M)" 라인 끝에 " [N점]" 추가
    const reDot = new RegExp(`(^|\\n)(\\s*${num}\\s*[.．)][^\\n]*?)(?=\\n|$)`, 'm');
    if (reDot.test(result)) {
      result = result.replace(reDot, `$1$2 ${ptsLabel}`);
      continue;
    }
    // 2)·3) "[서·논술형 N-M]" 또는 "[N-M]" 대괄호 직후에 " [N점]" 추가.
    //    [^\]]*? 가 대괄호 내부의 임의 prefix(서·논술형 등)를 흡수.
    const reBracket = new RegExp(`(\\[[^\\]]*?${num}\\s*\\])`, '');
    if (reBracket.test(result)) {
      result = result.replace(reBracket, `$1 ${ptsLabel}`);
    }
  }
  return result;
}

/**
 * 선택지 텍스트 정리 — \begin{array}/\begin{aligned} 블록을 줄별 $...$로 변환
 *   + 한글 자모 only 패턴(`\text{ㄱ, ㄴ}` 또는 `$ㄱ, ㄴ$`)은 KaTeX wrapping 풀어
 *     본문 폰트로 출력. KaTeX의 \text{} 안 한글이 fallback 폰트로 그려져
 *     "반듯하지 않게" 보이는 사고 차단.
 *
 * ★ 안전 가드: 행렬 (`$\left(\begin{array}{lll}2 & 2 & 2 \\ ...\end{array}\right)$`)
 *   은 *원본 유지*. 행렬은 한글·\text 없이 숫자/수식만 들어있으므로 그 조건으로
 *   판별. (이전엔 무조건 strip 해서 BS_H1S1_R2 #39 같은 행렬 객관식이 KaTeX
 *   파싱 실패로 빨간 텍스트 노출되던 사고)
 */
export function cleanChoiceText(text: string): string {
  return text
    .replace(
      /\$?\s*\\begin\{(?:array|aligned)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{(?:array|aligned)\}\s*\$?/gi,
      (m, inner: string) => {
        // ★ 한글 보기형(ㄱ./ㄴ./가/나/\text{...}) 인 경우만 변환.
        //   행렬 등 한글 없는 array 는 KaTeX 가 그대로 렌더하도록 원본 유지.
        const hasKoreanLabel = /[ㄱ-ㅎ가-힣]|\\text\s*\{/.test(inner);
        if (!hasKoreanLabel) return m;
        return inner
          .split('\\\\')
          .map((l: string) => `$${l.replace(/&/g, '').trim()}$`)
          .filter((l: string) => l !== '$$')
          .join(' ');
      }
    )
    // $\text{ㄱ, ㄴ}$ / \text{ㄱ, ㄴ} → ㄱ, ㄴ
    .replace(/^\$?\s*\\text\{\s*([ㄱ-ㅎ][ㄱ-ㅎ\s,]*)\s*\}\s*\$?$/, '$1')
    // $ㄱ, ㄴ$ → ㄱ, ㄴ
    .replace(/^\$\s*([ㄱ-ㅎ][ㄱ-ㅎ\s,]*)\s*\$$/, '$1');
}
