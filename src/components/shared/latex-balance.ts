// ============================================================================
// LaTeX 짝 복구 — 원본 수식의 짝 오류로 KaTeX 가 통째로 빨간 raw 가 되는 것을 막는다.
//
// ★ 왜 필요한가 (2026-09-02)
//   우리는 KaTeX 를 `throwOnError: false` 로 부른다. 이러면 파싱 에러가 **던져지지 않고**
//   그 자리에 빨간 원문이 렌더된다 → try/catch 폴백이 **아예 안 탄다.**
//   그래서 "짝이 안 맞는 것"은 렌더 **전에** 미리 고쳐야 한다.
//   같은 이유로 이미 balanceBraces(중괄호)가 있었고, 여기에 \left·\right 를 더한다.
//
//   실제 사고: `... \end{cases}\qquad \left.\begin{cases} ... \end{cases}`
//   (연립방정식 두 벌을 나란히 쓰면서 \left. 만 남고 \right 가 없음)
//   → "Expected '\right', got 'EOF'" → 문제 본문 전체가 빨간 LaTeX 로 보임.
//
// 원칙: **정상 콘텐츠에는 no-op.** 짝이 다 맞으면 입력을 그대로 돌려준다.
// ============================================================================

/**
 * 중괄호 균형 복구 — 짝 없는 `}` 제거 + 안 닫힌 `{` 만큼 `}` 추가.
 *   ★ 원본 수식 오타(예: `z_{1}}` 닫기 1개 더, 해운대고 #9)로 KaTeX 가 통째로 실패하던 것 구제.
 *   `\{`·`\}`(구분자 이스케이프)는 그룹이 아니므로 카운트 제외.
 */
export function balanceBraces(s: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const esc = i > 0 && s[i - 1] === '\\';
    if (ch === '{' && !esc) { depth++; out += ch; }
    else if (ch === '}' && !esc) { if (depth > 0) { depth--; out += ch; } /* 짝 없는 } 는 버림 */ }
    else out += ch;
  }
  return out + '}'.repeat(Math.max(0, depth));
}

/** `\left(` 의 `(` 처럼 자동크기 없이 그냥 찍을 때 쓸 문자. `.`(투명 구분자)는 사라진다. */
function plainDelimiter(delim: string | undefined): string {
  if (!delim || delim === '.' || delim === '\\.') return '';
  if (delim === '{' || delim === '\\{') return '\\lbrace ';
  if (delim === '}' || delim === '\\}') return '\\rbrace ';
  if (delim === '\\|') return '\\| ';
  if (delim.startsWith('\\')) return `${delim} `;   // \langle \lceil \Vert …
  return delim;                                      // ( ) [ ] | / 등
}

// \left / \right + 구분자.
//   (?![a-zA-Z]) 필수 — 없으면 `\leftarrow`·`\rightarrow` 를 잡아 화살표가 사라진다.
//   구분자 순서 주의: 여러 글자(\langle) → 이스케이프(\{) → 한 글자. 구분자가 아예 없는
//   결함 입력(`\right` 뒤에 아무것도 없음)도 세야 하므로 마지막에 `?`.
const LEFT_RIGHT_RE =
  /\\(left|right)(?![a-zA-Z])\s*(\\[a-zA-Z]+|\\[{}|.\\/]|[({[\]|.)}<>/])?/g;

/**
 * `\left` / `\right` 짝 복구 — **짝 없는 쪽만** 평범한 구분자로 낮춘다.
 *   짝이 맞는 쌍은 그대로 둬서 자동 크기 조절을 잃지 않는다.
 *   (전부 없애버리면 큰 분수 옆 괄호가 작아지는 회귀가 난다)
 *
 * 한계: `\begin{cases}` 같은 환경 경계를 넘나드는 짝은 개수만으로 알 수 없다.
 *   그건 여전히 렌더 폴백이 받는다. 여기서는 흔한 사고(개수 자체가 안 맞음)를 막는다.
 */
export function balanceLeftRight(s: string): string {
  if (!s.includes('\\left') && !s.includes('\\right')) return s;

  type Tok = { at: number; len: number; kind: 'left' | 'right'; delim: string | undefined };
  const toks: Tok[] = [];
  LEFT_RIGHT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LEFT_RIGHT_RE.exec(s)) !== null) {
    toks.push({ at: m.index, len: m[0].length, kind: m[1] as 'left' | 'right', delim: m[2] });
  }
  if (toks.length === 0) return s;

  const drop = new Set<number>();
  const open: number[] = [];
  toks.forEach((t, i) => {
    if (t.kind === 'left') open.push(i);
    else if (open.length > 0) open.pop();
    else drop.add(i);                 // 열린 것 없이 닫힘 → 고아 \right
  });
  for (const i of open) drop.add(i);  // 끝까지 안 닫힌 \left

  if (drop.size === 0) return s;      // ★ 정상 콘텐츠는 여기서 원본 그대로 반환

  let out = '';
  let pos = 0;
  toks.forEach((t, i) => {
    if (!drop.has(i)) return;
    out += s.slice(pos, t.at) + plainDelimiter(t.delim);
    pos = t.at + t.len;
  });
  return out + s.slice(pos);
}

/** 렌더 직전 공통 정제 — 짝 오류만 고친다(내용은 안 건드린다). */
export function balanceLatex(s: string): string {
  return balanceLeftRight(balanceBraces(s));
}
