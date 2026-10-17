// ============================================================================
// AI 응답 텍스트 정리 (2026-10-17 상당중 16번 — 공략에 "\n\n" 이 글자로 노출)
//   모델이 JSON 문자열 안에서 백슬래시를 이중으로 써서 줄바꿈이 리터럴 백슬래시+n 으로 남는다. 저장 전·렌더 전 둘 다 거친다.
//   LaTeX 의 \neq, \nabla, \not … 은 뒤에 글자가 오므로 건드리지 않는다 — 뒤에 글자가 안 오는 백슬래시+n 만.
// ============================================================================
const BS = String.fromCharCode(92);
const RE_DOUBLE_N = new RegExp(BS + BS + BS + BS + 'n', 'g'); // 백슬래시 2개 + n (LaTeX 엔 \\n… 명령이 없어 뒤 글자 무관)
const RE_SINGLE_N = new RegExp(BS + BS + 'n(?![A-Za-z])', 'g');           // 백슬래시 1개 + n
const RE_TAB = new RegExp(BS + BS + 't(?![A-Za-z])', 'g');

export function unescapeLiteralNewlines(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(RE_DOUBLE_N, '\n')
    .replace(RE_SINGLE_N, '\n')
    .replace(RE_TAB, ' ')
    .replace(/[ \t]*\n{3,}/g, '\n\n');
}
