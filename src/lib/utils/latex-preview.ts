// ============================================================================
// LaTeX 미리보기 자르기 — 수식 한가운데를 끊지 않는다
// ----------------------------------------------------------------------------
// ★ 사고 (2026-09-14, 대표: "이런 거 오류 계속 나오면 안 되는데"):
//   카드가 본문을 `content.slice(0, 200)` 으로 잘랐다. 200번째 글자가 하필
//   `\begin{tabular}` 한가운데라 화면에 **`\displaystyle \begin{ta` 가 글자로 샜다.**
//   DB 본문은 멀쩡했다 — 자르기가 만든 쓰레기다.
//
// ★ 글자 수로 자르면 언제든 다시 난다. 자른 뒤 **안전한 자리까지 되돌린다**:
//   ① 짝 안 맞는 `\begin{…}` 은 통째로 버린다 (`\begin{ta` 같은 토막 포함)
//   ② `$` 개수가 홀수면 마지막 `$` 앞에서 끊는다 (수식이 열린 채 끝나면 렌더가 깨진다)
//   ③ 닫히지 않은 `{` 는 그 앞에서 끊는다 (`\frac{1}{` 같은 토막)
//   ④ 끝에 남은 명령어 토막(`\disp`)은 버린다
//
// 미리보기는 조금 짧아져도 된다. 쓰레기가 보이는 것보다 낫다.
// ============================================================================

/** 이스케이프되지 않은 `$` 의 개수 */
function countDollars(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '$') continue;
    if (i > 0 && s[i - 1] === '\\') continue;
    n++;
  }
  return n;
}

/**
 * 미리보기용으로 자른다. LaTeX 구조 한가운데서는 끊지 않는다.
 *
 * @param text  본문 (content_latex)
 * @param max   최대 글자 수 (기본 200)
 * @param ellipsis 끝에 붙일 표시 (잘렸을 때만)
 */
export function truncateLatexPreview(text: string | null | undefined, max = 200, ellipsis = '…'): string {
  const src = text ?? '';
  if (src.length <= max) return src;

  let cut = src.slice(0, max);

  // ① 짝 없는 \begin{…} — 토막(`\begin{ta`)도 여기서 걸린다
  for (;;) {
    const bi = cut.lastIndexOf('\\begin');
    if (bi < 0) break;
    const after = cut.slice(bi);
    const m = /^\\begin\{([a-zA-Z*]+)\}/.exec(after);
    if (m && after.includes(`\\end{${m[1]}}`)) break;   // 닫혀 있다 — 그대로 둔다
    cut = cut.slice(0, bi);
  }

  // ② $ 홀수 — 수식이 열린 채 끝났다
  if (countDollars(cut) % 2 === 1) {
    const li = cut.lastIndexOf('$');
    if (li >= 0) cut = cut.slice(0, li);
  }

  // ③ 닫히지 않은 { — `\frac{1}{` 같은 토막
  let depth = 0;
  let lastOpen = -1;
  for (let i = 0; i < cut.length; i++) {
    const c = cut[i];
    if (c === '\\') { i++; continue; }           // 이스케이프된 글자는 건너뛴다
    if (c === '{') { if (depth === 0) lastOpen = i; depth++; }
    else if (c === '}') depth = Math.max(0, depth - 1);
  }
  if (depth > 0 && lastOpen >= 0) cut = cut.slice(0, lastOpen);

  // ④ 끝에 남은 명령어 토막
  cut = cut.replace(/\\[a-zA-Z]*$/, '');

  cut = cut.replace(/\s+$/, '');
  return cut.length > 0 ? cut + ellipsis : '';
}
