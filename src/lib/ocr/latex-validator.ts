// ============================================================================
// LaTeX Validation & Normalization
// ============================================================================

import type { LaTeXValidationResult, LaTeXIssue } from '@/types/ocr';

/**
 * LaTeX 수식 패턴 정규식
 */
const LATEX_PATTERNS = {
  // 인라인 수식 패턴
  INLINE_PAREN: /\\\((.+?)\\\)/gs,           // \(...\)
  INLINE_DOLLAR: /(?<!\$)\$(?!\$)(.+?)\$(?!\$)/gs,  // $...$
  INLINE_BRACKET: /\\\[(.+?)\\\]/gs,         // \[...\] (display로 변환 필요)

  // 디스플레이 수식 패턴
  DISPLAY_DOLLAR: /\$\$(.+?)\$\$/gs,         // $$...$$
  DISPLAY_BRACKET: /\\\[(.+?)\\\]/gs,        // \[...\]

  // 환경 패턴
  ENVIRONMENT: /\\begin\{(\w+)\}([\s\S]*?)\\end\{\1\}/g,

  // 일반적인 LaTeX 명령어
  COMMAND: /\\([a-zA-Z]+)(\{[^}]*\}|\[[^\]]*\])*/g,

  // 불완전한 패턴 (에러 감지용)
  UNMATCHED_BRACE: /\{[^}]*$|^[^{]*\}/,
  UNMATCHED_BRACKET: /\[[^\]]*$|^[^\[]*\]/,
  UNMATCHED_PAREN_LATEX: /\\\([^)]*$|^[^(]*\\\)/,
};

/**
 * 표준 LaTeX 명령어 목록 (수학용)
 */
const STANDARD_MATH_COMMANDS = new Set([
  // 그리스 문자
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon',
  'Phi', 'Psi', 'Omega',

  // 연산자
  'frac', 'sqrt', 'root', 'sum', 'prod', 'int', 'iint', 'iiint', 'oint',
  'lim', 'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',

  // 관계 연산자
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'propto',
  'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin',

  // 화살표
  'rightarrow', 'leftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow',
  'Leftrightarrow', 'to', 'gets', 'mapsto',

  // 기타
  'cdot', 'times', 'div', 'pm', 'mp', 'ast', 'star', 'circ', 'bullet',
  'oplus', 'otimes', 'odot',
  'infty', 'partial', 'nabla', 'forall', 'exists', 'neg', 'land', 'lor',
  'cap', 'cup', 'vee', 'wedge',

  // 구조
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
  'overline', 'underline', 'hat', 'tilde', 'bar', 'vec', 'dot', 'ddot',
  'overbrace', 'underbrace',

  // 매트릭스/배열
  'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'cases',
  'array', 'align', 'aligned', 'gather', 'gathered',

  // 텍스트/공백
  'text', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathcal', 'mathbb',
  'quad', 'qquad', 'hspace', 'vspace',

  // 분수/위첨자/아래첨자
  'dfrac', 'tfrac', 'cfrac', 'binom', 'dbinom', 'tbinom',
]);

/**
 * LaTeX 검증 및 정규화 클래스
 */
export class LaTeXValidator {
  private issues: LaTeXIssue[] = [];

  /**
   * LaTeX 텍스트 검증 및 정규화
   */
  validate(latex: string): LaTeXValidationResult {
    this.issues = [];
    let normalized = latex;

    // 1. 기본 정규화
    normalized = this.normalizeWhitespace(normalized);

    // 2. 수식 구분자 표준화
    normalized = this.normalizeDelimiters(normalized);

    // 3. 괄호 균형 검사
    this.checkBracketBalance(normalized);

    // 4. LaTeX 명령어 검증
    this.validateCommands(normalized);

    // 5. 일반적인 OCR 오류 수정
    normalized = this.fixCommonOCRErrors(normalized);

    // 6. 특수 문자 이스케이프 검증
    normalized = this.validateSpecialCharacters(normalized);

    return {
      is_valid: this.issues.filter(i => i.type === 'error').length === 0,
      normalized_latex: normalized,
      issues: this.issues,
    };
  }

  /**
   * 공백 정규화
   */
  private normalizeWhitespace(text: string): string {
    return text
      // 연속된 공백을 단일 공백으로
      .replace(/[ \t]+/g, ' ')
      // 수식 내부 불필요한 줄바꿈 제거
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * 수식 구분자 표준화 (\(...\) → $...$, \[...\] → $$...$$)
   */
  private normalizeDelimiters(text: string): string {
    let result = text;

    // \(...\) → $...$ (인라인)
    result = result.replace(LATEX_PATTERNS.INLINE_PAREN, (_, content) => {
      return `$${content.trim()}$`;
    });

    // \[...\] → $$...$$ (디스플레이)
    result = result.replace(LATEX_PATTERNS.DISPLAY_BRACKET, (_, content) => {
      return `$$${content.trim()}$$`;
    });

    return result;
  }

  /**
   * 괄호 균형 검사
   */
  private checkBracketBalance(text: string): void {
    const brackets = [
      { open: '{', close: '}', name: '중괄호' },
      { open: '[', close: ']', name: '대괄호' },
      { open: '(', close: ')', name: '소괄호' },
    ];

    for (const { open, close, name } of brackets) {
      let count = 0;
      let escaped = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '\\' && !escaped) {
          escaped = true;
          continue;
        }

        if (!escaped) {
          if (char === open) count++;
          if (char === close) count--;

          if (count < 0) {
            this.issues.push({
              type: 'error',
              message: `불균형한 ${name}: 닫는 괄호가 더 많습니다`,
              position: i,
              original: text.substring(Math.max(0, i - 10), i + 10),
            });
            count = 0;
          }
        }

        escaped = false;
      }

      if (count !== 0) {
        this.issues.push({
          type: 'error',
          message: `불균형한 ${name}: ${count > 0 ? '여는' : '닫는'} 괄호가 ${Math.abs(count)}개 더 많습니다`,
          original: text.substring(0, 50) + '...',
        });
      }
    }
  }

  /**
   * LaTeX 명령어 검증
   */
  private validateCommands(text: string): void {
    const commandPattern = /\\([a-zA-Z]+)/g;
    let match;

    while ((match = commandPattern.exec(text)) !== null) {
      const command = match[1];

      // 알려지지 않은 명령어 경고
      if (!STANDARD_MATH_COMMANDS.has(command) && !this.isCustomCommand(command)) {
        this.issues.push({
          type: 'warning',
          message: `알 수 없는 LaTeX 명령어: \\${command}`,
          position: match.index,
          original: `\\${command}`,
          suggested: this.suggestCommand(command),
        });
      }
    }
  }

  /**
   * 커스텀 명령어 여부 확인
   */
  private isCustomCommand(command: string): boolean {
    // 한글 폰트 관련 명령어
    const customCommands = ['한글', 'hfill', 'vfill', 'newline', 'linebreak', 'pagebreak'];
    return customCommands.includes(command);
  }

  /**
   * 비슷한 명령어 제안
   */
  private suggestCommand(command: string): string | undefined {
    const lowered = command.toLowerCase();

    // Levenshtein 거리 기반 유사 명령어 찾기
    let minDistance = Infinity;
    let suggestion: string | undefined;

    for (const std of STANDARD_MATH_COMMANDS) {
      const distance = this.levenshteinDistance(lowered, std.toLowerCase());
      if (distance < minDistance && distance <= 2) {
        minDistance = distance;
        suggestion = std;
      }
    }

    return suggestion ? `\\${suggestion}` : undefined;
  }

  /**
   * Levenshtein 거리 계산
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * 일반적인 OCR 오류 수정
   */
  private fixCommonOCRErrors(text: string): string {
    let result = text;

    // OCR에서 자주 발생하는 오류 패턴
    const replacements: [RegExp, string][] = [
      // 1과 l 혼동 (수식 컨텍스트에서)
      [/(?<=\d)l(?=\d)/g, '1'],      // 숫자 사이의 l → 1

      // 0과 O 혼동
      [/(?<=\d)O(?=\d)/g, '0'],      // 숫자 사이의 O → 0

      // x와 × 혼동
      [/(\d)\s*[xX]\s*(\d)/g, '$1 \\times $2'],

      // ÷ 기호
      [/÷/g, '\\div'],

      // ± 기호
      [/±/g, '\\pm'],

      // √ 기호
      [/√/g, '\\sqrt'],

      // ∞ 기호
      [/∞/g, '\\infty'],

      // π 기호
      [/π/g, '\\pi'],

      // θ 기호
      [/θ/g, '\\theta'],

      // ≤, ≥ 기호
      [/≤/g, '\\leq'],
      [/≥/g, '\\geq'],
      [/≠/g, '\\neq'],

      // → 기호
      [/→/g, '\\rightarrow'],
      [/←/g, '\\leftarrow'],

      // 분수 표기 정규화
      [/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}'],

      // 거듭제곱 표기
      [/\^(\d)(?![}\d])/g, '^{$1}'],

      // 아래첨자 표기
      [/_(\d)(?![}\d])/g, '_{$1}'],
    ];

    for (const [pattern, replacement] of replacements) {
      const before = result;
      result = result.replace(pattern, replacement);

      if (before !== result) {
        this.issues.push({
          type: 'warning',
          message: 'OCR 오류 자동 수정됨',
          original: pattern.source,
          suggested: replacement,
        });
      }
    }

    return result;
  }

  /**
   * 특수 문자 이스케이프 검증
   */
  private validateSpecialCharacters(text: string): string {
    let result = text;

    // LaTeX에서 이스케이프가 필요한 특수 문자
    const specialChars: [RegExp, string, string][] = [
      [/(?<!\\)%/g, '\\%', '%'],
      [/(?<!\\)&(?!amp;)/g, '\\&', '&'],
      [/(?<!\\)#/g, '\\#', '#'],
      [/(?<!\\)\$/g, '\\$', '$'],  // 수식 구분자가 아닌 경우
    ];

    // 수식 외부의 특수 문자만 처리
    // (간단한 구현 - 실제로는 더 정교한 파싱 필요)

    return result;
  }
}

/**
 * 싱글톤 인스턴스
 */
let validator: LaTeXValidator | null = null;

export function getLatexValidator(): LaTeXValidator {
  if (!validator) {
    validator = new LaTeXValidator();
  }
  return validator;
}

/**
 * 간편 검증 함수
 */
export function validateLatex(latex: string): LaTeXValidationResult {
  return getLatexValidator().validate(latex);
}

/**
 * LaTeX 수식 추출
 */
export function extractMathExpressions(text: string): { inline: string[]; display: string[] } {
  const inline: string[] = [];
  const display: string[] = [];

  // 디스플레이 수식 추출 ($$...$$)
  const displayMatches = text.matchAll(/\$\$(.+?)\$\$/gs);
  for (const match of displayMatches) {
    display.push(match[1].trim());
  }

  // 인라인 수식 추출 ($...$) - 디스플레이 제외
  const inlineText = text.replace(/\$\$.+?\$\$/gs, '');
  const inlineMatches = inlineText.matchAll(/\$(.+?)\$/gs);
  for (const match of inlineMatches) {
    inline.push(match[1].trim());
  }

  return { inline, display };
}

/**
 * LaTeX을 HTML로 변환 (간단한 버전)
 */
export function latexToHtml(latex: string): string {
  // MathJax/KaTeX를 사용한 렌더링은 클라이언트에서 처리
  // 여기서는 기본적인 구조만 래핑
  return latex
    .replace(/\$\$(.+?)\$\$/gs, '<div class="math-display">$$$$1$$</div>')
    .replace(/\$(.+?)\$/gs, '<span class="math-inline">$$1$</span>');
}
