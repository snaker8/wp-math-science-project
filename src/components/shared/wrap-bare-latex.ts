// ============================================================================
// bare LaTeX → $...$ 자동 감싸기 (MixedContentRenderer 에서 분리, 2026-09-02)
// ----------------------------------------------------------------------------
// ★ 왜 별도 파일인가: 이 저장소의 vitest 는 tsconfig `jsx: preserve` 때문에 `.tsx` 를
//   import 하지 못한다. 그래서 지금까지 렌더러 테스트가 **구현을 복사**해 두는 식이었고,
//   진짜 코드가 깨져도 테스트는 통과했다 — 사대부고 #17 사고가 그 경우다.
//   순수 함수라 옮겨도 동작은 같고, 이제 실제 코드를 테스트할 수 있다.
//   (선례: math-env-dollar.ts — 같은 이유로 분리됨)
//
// 로직은 옮기면서 한 줄도 바꾸지 않았다.
// ============================================================================

/**
 * bare LaTeX 명령어(\frac, \sqrt 등)가 $...$로 감싸져 있지 않으면 자동으로 감싸기
 * 예: "곱은 \frac{105}{4}이다" → "곱은 $\frac{105}{4}$이다"
 *
 * 전략: 텍스트를 문자 단위로 스캔하여 \ 로 시작하는 LaTeX 명령어를 찾고,
 * 중괄호/첨자/수식 기호를 포함한 전체 수식 범위를 파악하여 $...$로 감싼다.
 */
/**
 * `\left` / `\right` 바로 뒤의 구분자를 같이 먹는다 (공백이 끼어 있어도).
 *
 * ★ 사고 (2026-09-02, 사대부고 23-1-2-M #17)
 *   `f \left ( 6 \right ) + …` 에서 닫는 `)` 를 놓쳐 `$\left ( 6 \right$ )` 로 감쌌다.
 *   KaTeX 는 "Expected group as argument to '\right'" 로 실패하고 빨간 원문을 그린다.
 *   원인: 공백 처리의 문자 집합에 여는 `(` 는 있는데 닫는 `)` 가 없었다.
 *   같은 이유로 `\left\{ … \right\}` 도 `\{` 를 못 먹어 `$\left$\{ …` 로 잘렸다.
 *
 *   구분자는 `\left`/`\right` 문법의 일부라 떼어놓으면 반드시 깨진다 → 여기서 붙여 먹는다.
 *   다른 명령은 건드리지 않는다(no-op).
 */
function consumeDelimiter(text: string, pos: number, cmd: string): number {
  if (cmd !== 'left' && cmd !== 'right') return pos;
  const len = text.length;
  let d = pos;
  while (d < len && text[d] === ' ') d++;
  if (d >= len) return pos;
  // `\{` `\}` `\|` `\.` — 이스케이프된 구분자
  if (text[d] === '\\' && d + 1 < len && '{}|.'.includes(text[d + 1])) return d + 2;
  // `(` `)` `[` `]` `|` `.` `/` — 맨 구분자
  if ('()[]|./'.includes(text[d])) return d + 1;
  return pos;
}

export function wrapBareLatex(text: string): string {
  // 이미 $...$로 감싸진 부분은 보존하면서, bare LaTeX만 처리
  const parts: string[] = [];
  const mathRegex = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = mathRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(wrapBareLatexInSegment(text.substring(lastIdx, m.index)));
    }
    parts.push(m[0]);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(wrapBareLatexInSegment(text.substring(lastIdx)));
  }

  return parts.join('');
}

/** LaTeX 명령어 목록 — \command 형태 인식용 */
const LATEX_COMMANDS = new Set([
  // 분수/루트
  'frac', 'dfrac', 'tfrac', 'sqrt', 'root',
  // 적분/합/극한
  'sum', 'int', 'iint', 'iiint', 'oint', 'lim', 'prod', 'coprod',
  // 삼각함수/로그
  'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  // 그리스 문자
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon',
  'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
  'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi',
  'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon',
  'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi',
  'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  // 기호
  'infty', 'cdot', 'cdots', 'ldots', 'ddots', 'vdots',
  'times', 'div', 'pm', 'mp', 'ast', 'star', 'circ', 'bullet',
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'cong',
  'propto', 'perp', 'parallel', 'angle',
  'subset', 'supset', 'subseteq', 'supseteq', 'cup', 'cap',
  'in', 'notin', 'ni', 'forall', 'exists', 'nexists',
  'nabla', 'partial', 'prime',
  'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow',
  'leftrightarrow', 'Leftrightarrow', 'uparrow', 'downarrow',
  'to', 'gets', 'mapsto', 'implies', 'iff',
  // 괄호/구분자
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
  'langle', 'rangle', 'lfloor', 'rfloor', 'lceil', 'rceil',
  'lvert', 'rvert', 'lVert', 'rVert',
  // 장식
  'overline', 'underline', 'hat', 'vec', 'bar', 'dot', 'ddot', 'tilde',
  'widehat', 'widetilde', 'overbrace', 'underbrace',
  'overrightarrow', 'overleftarrow',
  // 글꼴/스타일
  'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'mathfrak',
  'boldsymbol', 'text', 'textbf', 'textit', 'textrm',
  'displaystyle', 'textstyle', 'scriptstyle',
  // 박스/공간
  'boxed', 'phantom', 'hspace', 'vspace', 'quad', 'qquad',
  'not', 'neg', 'cancel', 'bcancel', 'xcancel',
  // 기타
  'stackrel', 'overset', 'underset', 'choose', 'binom',
]);

/**
 * 텍스트 세그먼트(수식 밖)에서 bare LaTeX를 찾아 $...$로 감싼다.
 * 문자 단위 스캐닝으로 중괄호 depth를 추적하여 정확한 범위를 잡는다.
 */
function wrapBareLatexInSegment(segment: string): string {
  const result: string[] = [];
  let i = 0;
  const len = segment.length;

  while (i < len) {
    // \ 로 시작하는 LaTeX 명령어 감지
    if (segment[i] === '\\') {
      // 명령어 이름 추출
      let cmdEnd = i + 1;
      while (cmdEnd < len && /[a-zA-Z]/.test(segment[cmdEnd])) cmdEnd++;
      const cmd = segment.substring(i + 1, cmdEnd);

      if (cmd && LATEX_COMMANDS.has(cmd)) {
        // LaTeX 수식 범위를 확장하여 전체 수식을 캡처
        const mathStart = i;
        let pos = cmdEnd;
        pos = consumeDelimiter(segment, pos, cmd);
        pos = expandMathExpression(segment, pos);
        const mathExpr = segment.substring(mathStart, pos);
        if (mathExpr.length > 2) {
          result.push('$', mathExpr, '$');
        } else {
          result.push(mathExpr);
        }
        i = pos;
        continue;
      }
    }

    // 일반 문자 — 수식 기호 패턴 감지 (예: x^2, a_n, 2^{10})
    // 영문자/숫자 뒤에 ^나 _가 오면 수식으로 처리
    if (i < len - 1 && /[a-zA-Z0-9)]/.test(segment[i]) && (segment[i + 1] === '^' || segment[i + 1] === '_')) {
      const mathStart = i;
      let pos = i + 1;
      pos = expandMathExpression(segment, pos);
      // 앞의 문자까지 포함
      const mathExpr = segment.substring(mathStart, pos);
      if (mathExpr.length > 1) {
        result.push('$', mathExpr, '$');
        i = pos;
        continue;
      }
    }

    result.push(segment[i]);
    i++;
  }

  // 연속된 $...$를 합치기: $A$$B$ → $A B$ (연속 수식 병합)
  let joined = result.join('');
  joined = joined.replace(/\$\$(?!\$)/g, (match, offset) => {
    // $$ 가 display-math가 아닌지 확인 (연속된 inline-math 종료+시작)
    // 앞뒤 문맥을 봐서 display math가 아닌 경우 공백으로 병합
    const before = joined[offset - 1];
    const after = joined[offset + 2];
    if (before && before !== '\n' && after && after !== '\n') {
      return ' ';
    }
    return match;
  });

  return joined;
}

/**
 * 주어진 위치에서 수식 표현식을 확장한다.
 * 중괄호, 첨자(^, _), 후속 LaTeX 명령어, 수식 기호를 포함하여 최대 범위를 반환.
 */
function expandMathExpression(text: string, pos: number): number {
  const len = text.length;

  while (pos < len) {
    const ch = text[pos];

    // 중괄호 블록 {…}
    if (ch === '{') {
      pos = skipBraces(text, pos);
      continue;
    }

    // 첨자 ^ 또는 _
    if (ch === '^' || ch === '_') {
      pos++;
      if (pos < len) {
        if (text[pos] === '{') {
          pos = skipBraces(text, pos);
        } else if (text[pos] === '\\') {
          // \command 뒤의 첨자
          let cmdEnd = pos + 1;
          while (cmdEnd < len && /[a-zA-Z]/.test(text[cmdEnd])) cmdEnd++;
          pos = cmdEnd;
          pos = expandMathExpression(text, pos);
        } else {
          // 단일 문자 (예: ^2, _n)
          pos++;
        }
      }
      continue;
    }

    // 후속 LaTeX 명령어 (\left, \right, \frac 등)
    if (ch === '\\') {
      let cmdEnd = pos + 1;
      while (cmdEnd < len && /[a-zA-Z]/.test(text[cmdEnd])) cmdEnd++;
      const cmd = text.substring(pos + 1, cmdEnd);
      if (cmd && LATEX_COMMANDS.has(cmd)) {
        pos = consumeDelimiter(text, cmdEnd, cmd);
        pos = expandMathExpression(text, pos);
        continue;
      }
      // 특수 이스케이프: \, \; \! \> \: 등 spacing
      if (cmdEnd === pos + 1 && pos + 1 < len) {
        const nextCh = text[pos + 1];
        if (',;!>:| '.includes(nextCh) || nextCh === '(' || nextCh === ')' || nextCh === '[' || nextCh === ']') {
          pos = pos + 2;
          continue;
        }
      }
      break;
    }

    // 수식 연결 문자: +, -, =, <, >, (, ), 쉼표, 공백 등은 수식 내부에서 계속
    if ('+-=<>(),.|!:;'.includes(ch)) {
      pos++;
      continue;
    }

    // 공백 후 수식이 계속되는지 확인
    if (ch === ' ') {
      let lookahead = pos + 1;
      while (lookahead < len && text[lookahead] === ' ') lookahead++;
      if (lookahead < len) {
        const nextCh = text[lookahead];
        // 수식이 이어지는 경우: \command, {, ^, _, 숫자, 수식기호
        if (nextCh === '\\' || nextCh === '{' || nextCh === '^' || nextCh === '_' ||
            /[0-9a-zA-Z+\-=<>(]/.test(nextCh)) {
          // 공백 뒤에 LaTeX 명령어가 있으면 계속
          if (nextCh === '\\') {
            let nc = lookahead + 1;
            while (nc < len && /[a-zA-Z]/.test(text[nc])) nc++;
            const nextCmd = text.substring(lookahead + 1, nc);
            if (nextCmd && LATEX_COMMANDS.has(nextCmd)) {
              pos = lookahead;
              continue;
            }
          }
          // 공백 뒤 수식 기호가 아니라 한글이면 중단
          if (/[가-힣]/.test(text[lookahead])) break;
          // 수식 내 공백 허용
          pos = lookahead;
          continue;
        }
      }
      break;
    }

    // 숫자, 영문자 — 수식 내 변수/상수
    if (/[0-9a-zA-Z]/.test(ch)) {
      pos++;
      continue;
    }

    // 그 외 (한글 등) — 수식 종료
    break;
  }

  return pos;
}

/** 중괄호 블록을 건너뛴다. {…{…}…} 중첩 지원 */
function skipBraces(text: string, pos: number): number {
  if (text[pos] !== '{') return pos;
  let depth = 1;
  pos++;
  while (pos < text.length && depth > 0) {
    if (text[pos] === '{') depth++;
    else if (text[pos] === '}') depth--;
    pos++;
  }
  return pos;
}
