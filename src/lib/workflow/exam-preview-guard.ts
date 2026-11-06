// ============================================================================
// 예상 문제지(「미리보는 중간」 등) 학교기출 오적재 차단
//
// ★ 사고 (2026-11-06 현대청운고 26-1-1 공통수학1): 수학비서의 「미리보는 중간」(예상 문제지)
//   HML 이 `[26년][1-1][중간][현대청운고][공통수학1][미리보는중간]` 파일명으로 일괄 적재됐다.
//   제목은 앞 태그로만 만들어져 실제 내신과 같은 「26-1-1-M 현대청운고 공통수학1」이 됐고
//   exam_type 도 학교기출로 박혔다. 같은 식으로 올라간 시험지가 6장(129문항)이었다.
//
// 정책: 파일명·제목에 예상 문제지 표시가 있으면 학교기출로 저장하지 않는다.
//   시중교재(textbook)로 명시해 올릴 때만 허용 — 그때는 학교기출 탭에 섞이지 않는다.
// ============================================================================

/** 예상 문제지 표시. 「모의고사」는 별도 구분(exam_type=모의고사)이라 여기 넣지 않는다. */
const PREVIEW_EXAM_RE = /미리보는|예상\s*(?:문제|중간|기말|시험|고사)|시험\s*대비|족보/;

/** 파일명·제목 중 예상 문제지 표시가 있으면 그 표시를 돌려준다. 없으면 null. */
export function detectPreviewExam(...names: Array<string | null | undefined>): string | null {
  for (const n of names) {
    if (!n) continue;
    const m = n.match(PREVIEW_EXAM_RE);
    if (m) return m[0];
  }
  return null;
}

/** 차단 메시지 — 업로드 화면 alert / API error 에 그대로 쓴다. */
export function previewExamBlockMessage(marker: string, fileName: string): string {
  return `「${marker}」 표시가 있는 파일은 예상 문제지라 학교기출로 올리지 않습니다: ${fileName}\n` +
    `실제 내신 파일을 올리거나, 예상 문제지로 보관하려면 출처를 「시중교재」로 지정해 다시 올려 주세요.`;
}

/** 학교기출로 저장하려는 경로에서 막아야 하는지 — 시중교재 명시만 통과. */
export function shouldBlockPreviewExam(
  sourceCategory: string | null | undefined,
  ...names: Array<string | null | undefined>
): string | null {
  if (sourceCategory === 'textbook') return null;
  return detectPreviewExam(...names);
}
