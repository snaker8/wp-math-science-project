// ============================================================================
// 시험지 학년 결정 — 어떤 출처를 믿을지 한 곳에서.
//
// 2026-10-07 사고(양운고 "26-2-2-M 양운고 기하"): 자산화 때 고른 과목 코드 13(기하)의 대표 학년 '고3' 이 exams.grade 에 박혀
// 학부모 공유 리포트 제목이 "· 고3" 으로 나감. 제목의 "2-2" 는 2학년 2학기다.
//   고등 선택과목(09 대수 · 10 미적분1 · 11 확률과 통계 · 12 미적분2 · 13 기하)은 고2·고3 어느 쪽에서도 배운다 — 코드의 학년은
//   "대표값"일 뿐이므로, 제목에 고등 학년이 명시돼 있으면 그쪽을 믿는다. 중등(01~06)·공통수학(07·08)은 코드가 학년을 확정한다.
// 우선순위: 명시값(폴더 메타 등) > [선택과목이면 제목 학년] > 과목 코드 학년 > 제목 학년 > null
// ============================================================================
import { curriculumCodesToSubjectGrade } from './mathsecr-prompt';
import { detectGradeFromTitle } from './title-detect';

const HIGH_ELECTIVE_CODES = new Set(['09', '10', '11', '12', '13']);

export function resolveExamGrade(
  curriculumCodes: string[] | null | undefined,
  title: string | null | undefined,
  explicit?: string | null,
): string | null {
  if (explicit && explicit.trim()) return explicit.trim();
  const codeMeta = curriculumCodesToSubjectGrade(curriculumCodes);
  const titleGrade = detectGradeFromTitle(title || '') || null;
  const firstCode = (curriculumCodes || []).map((c) => String(c ?? '').trim()).find((c) => c.length > 0) || '';
  if (codeMeta && HIGH_ELECTIVE_CODES.has(firstCode) && titleGrade && /^고[1-3]$/.test(titleGrade)) {
    return titleGrade;
  }
  return codeMeta?.grade ?? titleGrade;
}
