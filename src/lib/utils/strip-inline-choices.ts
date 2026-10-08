// ============================================================================
// 본문 끝에 붙은 인라인 보기(① … ⑤) 제거 — answer_json.choices 와 일치할 때만 (CLAUDE.md 가드 #9 2차 안전망).
// 2026-10-08: useExamProblems(화면)에서 공용 util 로 이동 — 한글(.hwpx) 내보내기도 같은 안전망을 쓴다
//   (대표 캡처: 한글 파일에 보기가 본문 안 한 번 + 보기 그리드 한 번, 두 번 들어감).
//
// ★ 2026-06-02 사고: 일부 자산화 데이터(예: 6/1 자산화 시험지)는 content_latex "끝"에
//   보기(① 4 ② 5 ③ 6 ④ 7 ⑤ 8)가 그대로 들어있고, answer_json.choices 에도 같은 보기가 있다.
//   hasDbChoices 경로는 본문 cut 사고(2026-05-25) 회피 위해 fullContent 를 그대로 쓰므로,
//   "본문(인라인 보기 포함) + 보기 그리드" 가 둘 다 렌더 → 보기가 화면에 중복으로 보임.
//
// 안전 원칙:
//   - dbChoices 와 본문 "끝 블록" 이 실제로 일치할 때만 그 끝 블록을 제거한다(보기 그리드는 유지).
//   - 엄격 규칙: 마커 위치는 lastIndexOf 로 "맨 끝 런" 을 역추적 → 본문 중간의 ①(표·설명·보기 아닌 것)은 보존.
//   - 느슨 규칙(2026-10-08): ④가 "①"로 오인식돼 순서가 깨진 런(부흥고 미적분1 #3) — 마지막 n개 마커 런의 꼬리 텍스트에
//     DB 보기 내용이 과반 포함될 때만 자른다. 내용 대조가 그대로라 서술형 단계·라벨은 안 잘린다.
//   - 질문(head)이 거의 없으면(전체가 보기뿐) 위험하므로 패스.
// ============================================================================

const MARKERS = ['①', '②', '③', '④', '⑤'];

/** 마커·LaTeX 명령·공백·$·괄호·구두점 제거 후 비교 (본문 $11$ vs 보기 11 같은 차이 흡수) */
const normChoice = (s: string): string =>
  s
    .replace(/[①②③④⑤]/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[\s${}().,]/g, '')
    .toLowerCase();

export function stripTrailingInlineChoices(text: string, dbChoices: string[]): string {
  const n = dbChoices.length;
  if (n < 2 || n > 5) return text;
  const strict = stripStrict(text, dbChoices);
  if (strict !== null) return strict;
  return stripLoose(text, dbChoices);
}

/** 엄격 — 끝 런이 ①…ⓝ 순서대로 있고 과반 일치일 때만 head. 아니면 null(느슨 규칙으로) */
function stripStrict(text: string, dbChoices: string[]): string | null {
  const n = dbChoices.length;
  const pos = new Array<number>(n);
  pos[n - 1] = text.lastIndexOf(MARKERS[n - 1]);
  if (pos[n - 1] === -1) return null;
  for (let k = n - 2; k >= 0; k--) {
    pos[k] = text.lastIndexOf(MARKERS[k], pos[k + 1] - 1);
    if (pos[k] === -1) return null; // 순서대로 못 찾음 → 느슨 규칙으로
  }
  const start = pos[0];
  const head = text.slice(0, start).trim();
  if (head.length < 5) return null; // 질문이 사실상 없음 → 위험
  let matches = 0;
  for (let k = 0; k < n; k++) {
    const segEnd = k + 1 < n ? pos[k + 1] : text.length;
    const segN = normChoice(text.slice(pos[k], segEnd));
    const dbN = normChoice(dbChoices[k] || '');
    if (segN && dbN && segN === dbN) matches++;
  }
  // 과반(60%) 이상 일치해야 "이 끝 블록 = 보기" 로 확신 → 제거
  return matches >= Math.ceil(n * 0.6) ? head : null;
}

/** 느슨 — 마지막 n개(최소 n-1개) 동그라미 마커 런의 꼬리에 DB 보기 내용이 과반 포함되면 런 시작부터 자른다 */
function stripLoose(text: string, dbChoices: string[]): string {
  const n = dbChoices.length;
  const positions: number[] = [];
  const re = /[①②③④⑤]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) positions.push(m.index);
  if (positions.length < Math.max(2, n - 1)) return text;
  const run = positions.slice(-n);
  const start = run[0];
  const head = text.slice(0, start).trim();
  if (head.length < 5) return text;
  const tailN = normChoice(text.slice(start));
  const dbNs = dbChoices.map((c) => normChoice(c || '')).filter((s) => s.length > 0);
  if (dbNs.length === 0) return text;
  const matches = dbNs.filter((s) => tailN.includes(s)).length;
  return matches >= Math.ceil(n * 0.6) ? head : text;
}
