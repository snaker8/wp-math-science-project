/**
 * LaTeX 렌더 수정 라이브러리 (renderRepair)
 *
 * ★ 이 모듈은 **KaTeX 렌더링 실패**(split 구간정의함수, 빈 수식 블록 등)를 교정합니다.
 *   이름을 "autofix/자동수정"이 아닌 **renderRepair/렌더 수정**으로 의도적으로 분리했습니다.
 *   - "자동수정(autofix)"은 기존 유형매핑 로직 용어로 유지 (auto-fix/route.ts 내부 FIX 1~4)
 *   - 이 모듈은 FIX 4.6 보강 패스로만 동작하며, 다른 DB 값은 건드리지 않습니다.
 *
 * 현재 다루는 패턴:
 *  - Mathpix가 split 해버린 구간정의함수/연립방정식 조각 병합
 *    · `$X\left\{$` + `$\begin{array}...\end{array}$` + `$\right.Y$`
 *    · `$X\left\{$` + `$eq1$` + `$eq2$` + `$\right.Y$` (bare 2줄)
 *  - `$ \displaystyle $` 같은 빈 수식 블록 제거 (display $$...$$ 경계 보호)
 *
 * 설계 원칙:
 *  - 순수 함수. 입력 변경 없으면 정확히 같은 문자열 반환 (=== 비교 안전)
 *  - 부작용 없음 (DB·IO 없음)
 *  - 매우 보수적인 매칭. 기존 정상 콘텐츠를 건드리지 않는다.
 */

export interface LatexRepairResult {
  /** 수정된 콘텐츠. 변화 없으면 원본 반환 */
  fixed: string;
  /** 발동된 규칙 이름 목록 */
  changes: string[];
}

// ─────────────────────────────────────────────────────────────
// Rule A: 분할된 구간정의함수 (array 본체)
//   `$ ... \left\{ $  $ \begin{array}{l}...\end{array} $  $ \right. ... $`
//   → `$$ ... \left\{ \begin{array}{l}...\end{array} \right. ... $$`
// ─────────────────────────────────────────────────────────────
const SPLIT_PIECEWISE_ARRAY =
  /\$([^$\n]*?\\left\s*\\?\{)\s*\$\s*\n*\s*\$(\\begin\{array\}(?:\{[^}]*\})?[\s\S]*?\\end\{array\})\s*\$\s*\n*\s*\$(\\right\s*\.[^$\n]*?)\$/g;

// ─────────────────────────────────────────────────────────────
// Rule B: 분할된 구간정의함수 (bare 2줄)
//   `$ X \left\{ $  $ eq1 $  $ eq2 $  $ \right. Y $`
//   → `$$ X \begin{cases} eq1 \\\\ eq2 \end{cases} Y $$`
//   (기존 singleSystemPattern 은 X/Y 빈칸 전제였음 → 이 규칙이 prefix/suffix 지원)
// ─────────────────────────────────────────────────────────────
const SPLIT_PIECEWISE_BARE =
  /\$([^$\n]*?)\\left\s*\\?\{\s*\$\s*\n*\s*\$([^$\n]+)\$\s*\n*\s*\$([^$\n]+)\$\s*\n*\s*\$\\right\s*\.\s*([^$\n]*?)\$/g;

// ─────────────────────────────────────────────────────────────
// Rule C: `$ \displaystyle $` 또는 `$  $` 같은 빈/무의미 블록
//   (렌더러가 `\displaystyle` 을 제거하면 `$  $` 공백 블록이 남아 에러 유발 가능)
//   ★ 중요: 개행 포함 매칭 금지 (두 math 블록의 경계를 잘못 잡으면 본문 손상).
//   ★ 중요: `$$...$$` (display math) 경계를 침범하지 않도록 lookaround 로 보호.
// ─────────────────────────────────────────────────────────────
const EMPTY_MATH_BLOCK = /(?<!\$)\$([ \t]+|\\displaystyle[ \t]*|[ \t]*\\displaystyle[ \t]*)\$(?!\$)/g;

function containsBareArray(middle: string): boolean {
  return /\\begin\{(?:array|cases|aligned|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|equation)\}/.test(middle);
}

function frameRow(s: string): string {
  // bare 수식에서 `\displaystyle` 제거 + trim
  return s.replace(/\\displaystyle\s*/g, '').trim();
}

/**
 * 단독 \frac 를 \dfrac 로 승격 (cases/inline 환경에서 분수 시각 크기 유지)
 * — 이미 \dfrac 인 것은 건드리지 않는다.
 */
function promoteFracInCases(inner: string): string {
  return inner.replace(/\\frac\b/g, '\\dfrac');
}

/**
 * 렌더 수정 실행.
 *
 * 변경이 없으면 `fixed === input` (동일 참조 반환 X, 하지만 문자열 동등).
 * 어떤 규칙도 발동 안 하면 changes 는 빈 배열.
 */
export function repairLatexRender(input: string): LatexRepairResult {
  if (!input || typeof input !== 'string') {
    return { fixed: input || '', changes: [] };
  }

  const changes: string[] = [];
  let fixed = input;

  // ─── Rule A ───
  {
    SPLIT_PIECEWISE_ARRAY.lastIndex = 0;
    const before = fixed;
    fixed = fixed.replace(SPLIT_PIECEWISE_ARRAY, (_m, prefix: string, middle: string, suffix: string) => {
      // 병합된 블록이 너무 커지면 위험 → 길이 sanity check (> 2000자면 skip)
      if ((prefix.length + middle.length + suffix.length) > 2000) return _m;
      const mergedInner = `${frameRow(prefix)}${middle}${frameRow(suffix)}`;
      return `$$${mergedInner}$$`;
    });
    if (fixed !== before) changes.push('분할된 구간정의함수 병합 (array)');
  }

  // ─── Rule B ───
  {
    SPLIT_PIECEWISE_BARE.lastIndex = 0;
    const before = fixed;
    fixed = fixed.replace(
      SPLIT_PIECEWISE_BARE,
      (_m, prefix: string, eq1: string, eq2: string, suffix: string) => {
        // 이미 array/cases 가 들어있으면 Rule A 스코프 → 여긴 skip
        if (containsBareArray(eq1) || containsBareArray(eq2)) return _m;
        // eq 내용이 수식처럼 안 보이면 skip (false positive 방지)
        const looksLikeMath = (s: string) =>
          /[=<>+\-*/^_]|\\[a-zA-Z]+/.test(s) && !/[가-힣]/.test(s);
        if (!looksLikeMath(eq1) || !looksLikeMath(eq2)) return _m;
        const body = `${promoteFracInCases(frameRow(eq1))} \\\\ ${promoteFracInCases(frameRow(eq2))}`;
        const pfx = frameRow(prefix);
        const sfx = frameRow(suffix);
        return `$${pfx}\\begin{cases}${body}\\end{cases}${sfx}$`;
      },
    );
    if (fixed !== before) changes.push('분할된 구간정의함수 병합 (bare 2줄)');
  }

  // ─── Rule C ───
  {
    EMPTY_MATH_BLOCK.lastIndex = 0;
    const before = fixed;
    fixed = fixed.replace(EMPTY_MATH_BLOCK, '');
    if (fixed !== before) changes.push('빈 수식 블록 제거');
  }

  return { fixed, changes };
}

/**
 * 학습된 규칙 타입 — DB 에서 로드된 (original → corrected) 쌍.
 */
export interface LearnedRule {
  id?: string;
  original: string;
  corrected: string;
  confidence: number;
}

/**
 * 학습된 규칙을 콘텐츠에 적용.
 *  - confidence ≥ 0.7 규칙만 사용
 *  - original 길이 8자 미만은 스킵 (노이즈 방지)
 *  - 정확한 문자열 매칭만 사용 (정규식 아님). 오발동 위험 최소화.
 *
 * 반환값의 changes 에는 적용된 규칙 개수만 기록.
 */
export function applyLearnedRules(input: string, rules: LearnedRule[]): LatexRepairResult {
  if (!input || !rules || rules.length === 0) {
    return { fixed: input || '', changes: [] };
  }

  let fixed = input;
  let applied = 0;
  for (const rule of rules) {
    if (!rule || !rule.original || !rule.corrected) continue;
    if (rule.confidence < 0.7) continue;
    if (rule.original.length < 8) continue;
    if (rule.original === rule.corrected) continue;
    if (fixed.includes(rule.original)) {
      fixed = fixed.split(rule.original).join(rule.corrected);
      applied++;
    }
  }

  const changes: string[] = [];
  if (applied > 0) changes.push(`학습 규칙 ${applied}건 적용`);
  return { fixed, changes };
}

/**
 * 문제/해설 콘텐츠 양쪽 모두에 적용.
 * 변경이 있으면 각각 changes 누적해서 반환.
 */
export function repairProblemLatexRender(contents: {
  content_latex?: string | null;
  solution_latex?: string | null;
}): {
  content_latex?: string;
  solution_latex?: string;
  changes: string[];
} {
  const allChanges: string[] = [];
  const out: { content_latex?: string; solution_latex?: string; changes: string[] } = { changes: allChanges };

  if (typeof contents.content_latex === 'string' && contents.content_latex) {
    const r = repairLatexRender(contents.content_latex);
    if (r.changes.length > 0 && r.fixed !== contents.content_latex) {
      out.content_latex = r.fixed;
      for (const c of r.changes) allChanges.push(`content: ${c}`);
    }
  }

  if (typeof contents.solution_latex === 'string' && contents.solution_latex) {
    const r = repairLatexRender(contents.solution_latex);
    if (r.changes.length > 0 && r.fixed !== contents.solution_latex) {
      out.solution_latex = r.fixed;
      for (const c of r.changes) allChanges.push(`solution: ${c}`);
    }
  }

  return out;
}
