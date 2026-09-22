// 빠른정답 셀에 서답형 답을 어떻게 보일지 — 순수 함수 (ExamPaperView QuickAnswerView 에서 호출).
//
// 사고 (2026-09-22, 학장중 24-2-2-M 빠른정답 캡처):
//   ① `[4-1] ㄱ, ㄷ [4-2] ㄴ, ㄹ` — "4-1" 이 숫자 연산처럼 보여 통째로 $…$ 로 감싸 수식 모드(이탤릭·공백 붕괴).
//   ② `[1-1] 삼각형 ABC의 …` 긴 한글 서술 답도 같은 이유로 수식 모드 → 글자가 붙고 칸을 넘침.
//   ③ 결론부 추출(`= … $`)이 마지막 `=` 뒤만 잘라 닫는 `$` 만 남김 → `34 cm$` 고아 `$`.
// 규칙:
//   - 소문항 라벨 `[n-m]`·`(n)`·줄바꿈·환경이 있으면 구조형 → 추출·자동 감싸기 안 함, 라벨마다 줄바꿈해 세로로 보인다.
//   - 한글 음절이 섞인 답은 수식으로 감싸지 않는다 (안의 `$…$` 는 그대로 렌더).
//   - 추출한 결론부의 `$` 가 홀수면 고아 `$` 를 걷고 다시 판단.

const SUB_LABEL = /\[\d+\s*-\s*\d+\]/;

export function isStructuredAnswer(str: string): boolean {
  return /\(\s*[1-9]\s*\)[\s\S]*\(\s*[2-9]\s*\)/.test(str)
    || SUB_LABEL.test(str)
    || /\n/.test(str)
    || /\\begin\{(?:cases|aligned|array)\}/.test(str);
}

/** 소문항 라벨 앞에서 줄을 나눈다 — `[1-1] … [1-2] …` → 두 줄. 이미 줄바꿈이 있으면 그대로. */
export function breakAtSubLabels(str: string): string {
  if (/\n/.test(str)) return str;
  return str.replace(/\s+(?=\[\d+\s*-\s*\d+\])/g, '\n').replace(/\s+(?=\(\s*[2-9]\s*\)\s)/g, '\n').trim();
}

export function looksLikeMath(s: string): boolean {
  if (/[가-힣]/.test(s)) return false; // 한글 서술은 수식이 아니다
  return /[\\^_{}]|\\frac|\\sqrt|\\dfrac|[a-zA-Z]\s*[=+\-*/]|[0-9]+\s*[+\-*/]\s*[0-9]/.test(s);
}

/** `$` 개수가 홀수면 앞/뒤 고아 `$` 를 걷는다 */
export function balanceDollars(s: string): string {
  const n = (s.match(/\$/g) || []).length;
  if (n % 2 === 0) return s;
  let t = s.trim();
  if (t.endsWith('$')) t = t.slice(0, -1).trimEnd();
  else if (t.startsWith('$')) t = t.slice(1).trimStart();
  else t = t.replace(/\$/g, '');
  return t;
}

/** 서답형 답 문자열 → 빠른정답 셀에 넣을 문자열 (MixedContentRenderer 가 그린다) */
export function quickAnswerDisplay(str: string): string {
  if (isStructuredAnswer(str)) return breakAtSubLabels(str);
  let display = str;
  const tailEq = str.match(/=\s*([^=]+?)\s*(?:이다\s*[.]?|입니다\s*[.]?|\.?)\s*$/);
  const conclusion = str.match(/(?:따라서|그러므로|∴|답은|정답은|최종\s*답은?)\s*([^.]+?)(?:\s*이다\s*[.]?|\s*입니다\s*[.]?|\.?)\s*$/);
  if (str.length > 40 && tailEq && tailEq[1].trim().length < 40) display = tailEq[1].trim();
  else if (str.length > 40 && conclusion && conclusion[1].trim().length < 40) display = conclusion[1].trim();
  display = balanceDollars(display);
  const hasDollar = /\$/.test(display);
  if (!hasDollar && looksLikeMath(display)) display = `$${display}$`;
  return display;
}
