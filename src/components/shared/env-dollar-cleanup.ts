// ============================================================================
// `$\begin{...}` / `\end{...}$` 에 붙은 고립 `$` 정리
//   (MixedContentRenderer 전처리 1-3 단계에서 분리, 2026-09-02)
// ============================================================================
//
// Mathpix/HWP 변환물은 수식 환경을 `$` 로 어중간하게 감싸 내보내는 일이 있다.
// 환경(`\begin{...}…\end{...}`)은 KaTeX 가 직접 렌더하므로 그 `$` 는 군더더기다.
// cases 는 `$`/`$$` 안에서 KaTeX 가 직접 처리하므로 제외한다.
//
// ★ 사고 (2026-09-02, 사대부고 23-1-2-M #17)
//   닫는 쪽 규칙의 공백이 `\s*` 였다. `\s` 는 줄바꿈을 포함하므로
//   `\end{tabular}` 다음 **줄을 여는 `$` 까지 먹어치웠다.**
//     \end{tabular}⏎$f \left ( 6 \right ) + …$의 값을 구하시오.
//        → \end{tabular}f \left ( 6 \right ) + …$의 값을 구하시오.
//   수식이 통째로 본문 취급이 되어 화면에 빨간 원문이 노출됐다.
//   지우려는 대상은 `\end{...}` **바로 뒤에 붙은** `$` 뿐이므로 같은 줄 공백만 본다.
//
// ★ 별도 파일인 이유: vitest 가 `.tsx` 를 import 하지 못해(tsconfig `jsx: preserve`)
//   렌더러 테스트가 구현을 복제해 왔고, 그 탓에 실제 코드의 결함이 테스트를 통과했다.
//   순수 함수로 빼서 진짜 코드를 검증한다. (선례: math-env-dollar.ts)

/** `$\begin{env}` → `\begin{env}` (cases 제외) */
export function stripDollarBeforeEnv(s: string): string {
  return s
    .replace(/\$\$\\begin\{(?!cases)/g, '\\begin{')   // $$ 먼저
    .replace(/\$\\begin\{(?!cases)/g, '\\begin{');
}

/**
 * `\end{env}$` → `\end{env}` (cases 제외).
 * ★ 공백은 **같은 줄만**(`[ \t]*`) — 줄바꿈을 넘으면 다음 줄의 여는 `$` 를 지운다.
 */
export function stripDollarAfterEnv(s: string): string {
  return s
    .replace(/\\end\{(?!cases)([^}]+)\}[ \t]*\$\$/g, '\\end{$1}')   // $$ 먼저
    .replace(/\\end\{(?!cases)([^}]+)\}[ \t]*\$/g, '\\end{$1}');
}
