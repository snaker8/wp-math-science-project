// ============================================================================
// Folder Meta Extractor — 폴더 import 시 webkitRelativePath + 파일명에서 메타 추출
//
// 입력 예시:
//   path: "중2/동래구/1/260528_동래중학교 - 수와 식_문제지.pdf"
//   sido: "부산" (사용자가 폴더 import 페이지에서 1회 선택)
//
// 출력:
//   {
//     grade: 2,
//     schoolLevel: '중',
//     district: '부산 동래구',
//     semester: 1,
//     examYear: 2026,
//     examMonth: 5,
//     schoolName: '동래중학교',
//     chapter: '수와 식',
//     examRound: '단원집',
//     documentType: 'PROBLEM',
//   }
// ============================================================================

import { normalizeSchoolName } from '@/lib/utils/school-normalize';

export interface FolderMetaResult {
  /** 학교급 ("중"/"고"/"초") */
  schoolLevel: '초' | '중' | '고' | null;
  /** 학년 (1-3 for 중/고, 1-6 for 초) */
  grade: number | null;
  /** 학기 (1 or 2) */
  semester: 1 | 2 | null;
  /** "부산 동래구" 형식 — sido prefix + 폴더에서 추출한 시군구 */
  district: string | null;
  /** raw 시군구 (예: "동래구") */
  sigungu: string | null;
  /** 시험 년도 (2026) — 파일명 YYMMDD prefix 에서 */
  examYear: number | null;
  /** 시험 월 (1-12) — 파일명 YYMMDD prefix 에서, 참고용 (DB 컬럼 없음) */
  examMonth: number | null;
  /** 학교명 raw (예: "동래중학교"). DB 저장 전 normalize 적용. */
  schoolName: string | null;
  /** normalize 적용된 학교명 ("동래중"). DB 저장 직전 값. */
  schoolNameNormalized: string | null;
  /** 단원명 (예: "수와 식", "방정식") */
  chapter: string | null;
  /** 시험 회차 — "중간"/"기말"/"단원집"/"수행평가" */
  examRound: string | null;
  /** PDF 종류 — "PROBLEM" (문제지) / "ANSWER" (정답지) / "QUICK_ANSWER" (빠른정답) */
  documentType: 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER';
  /** 자동 추출 자신없는 필드 — 미리보기에 ⚠ 표시용 */
  warnings: string[];
}

/**
 * webkitRelativePath + 시도(사용자 선택) → FolderMetaResult
 *
 * 폴더 패턴 (사용자 매쓰플랫 자료):
 *   "중2/동래구/1/260528_동래중학교 - 방정식_문제지.pdf"
 *   "고1/강남구/2/250912_서울고 - 함수_문제지.pdf"
 *
 * 1단계 토큰: "중2"/"고1" — 학교급 + 학년
 * 2단계 토큰: "동래구"/"강남구" — 시군구
 * 3단계 토큰: "1"/"2" — 학기
 * 4단계: 파일명 — `${YYMMDD}_${schoolName} - ${chapter}_${documentType}.pdf`
 */
export function extractFolderMeta(
  webkitRelativePath: string,
  sido: string | null,
): FolderMetaResult {
  const warnings: string[] = [];
  const parts = webkitRelativePath.split('/').filter(Boolean);

  // ── 폴더 토큰 파싱 ──
  let schoolLevel: '초' | '중' | '고' | null = null;
  let grade: number | null = null;
  let sigungu: string | null = null;
  let semester: 1 | 2 | null = null;

  // 폴더 깊이는 가변적 (사용자가 root 부터 import 할지, 중2 폴더부터 할지 모름).
  // 룰: 각 폴더 토큰을 패턴으로 매칭 — "중1"/"중2"/"중3"/"고1"/"고2"/"고3" / "동래구"/시군구 / "1"/"2"(학기)
  for (const tok of parts.slice(0, -1)) {  // 마지막은 파일명
    // 학교급 + 학년: "중1", "중2", "중3", "고1", "고2", "고3", "초1"~"초6"
    const mGrade = tok.match(/^(초|중|고)\s*([1-6])$/);
    if (mGrade) {
      schoolLevel = mGrade[1] as '초' | '중' | '고';
      grade = Number(mGrade[2]);
      continue;
    }
    // 시군구: 끝이 "구"/"시"/"군"
    if (/(?:구|시|군)$/.test(tok) && tok.length >= 2 && tok.length <= 8) {
      sigungu = tok;
      continue;
    }
    // 학기: "1"/"2" 단독 (또는 "1학기"/"2학기")
    const mSem = tok.match(/^([12])(?:학기)?$/);
    if (mSem) {
      semester = Number(mSem[1]) as 1 | 2;
      continue;
    }
  }

  if (!grade) warnings.push('학년 미감지');
  if (!semester) warnings.push('학기 미감지');
  if (!sigungu) warnings.push('시군구 미감지');

  // district 조합
  const district = sido && sigungu ? `${sido} ${sigungu}` : (sigungu || null);
  if (!sido) warnings.push('시도 미선택');

  // ── 파일명 파싱 ──
  const fileName = parts[parts.length - 1] || '';
  const fileNameNoExt = fileName.replace(/\.[^/.]+$/, '');

  let examYear: number | null = null;
  let examMonth: number | null = null;
  let schoolName: string | null = null;
  let chapter: string | null = null;
  let examRound: string | null = '단원집'; // 단원집 PDF 가 default
  let documentType: 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER' = 'PROBLEM';

  // YYMMDD prefix
  const mDate = fileNameNoExt.match(/^(\d{2})(\d{2})(\d{2})_/);
  let fileBody = fileNameNoExt;
  if (mDate) {
    const yy = Number(mDate[1]);
    const mm = Number(mDate[2]);
    const dd = Number(mDate[3]);
    // 합리적 범위만 (yy 00-99, mm 1-12, dd 1-31)
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      examYear = 2000 + yy;
      examMonth = mm;
      fileBody = fileNameNoExt.slice(mDate[0].length);
    }
  }
  if (!examYear) warnings.push('년도 미감지');

  // 문서 종류
  if (/빠른\s*정답|빠른정답/.test(fileBody)) documentType = 'QUICK_ANSWER';
  else if (/정답지|해설지|답안지/.test(fileBody)) documentType = 'ANSWER';
  else if (/문제지|시험지/.test(fileBody)) documentType = 'PROBLEM';

  // 회차 키워드 우선 — "중간"/"기말"/"수행"이 명시되면 단원집 아님
  if (/중간/.test(fileBody)) examRound = '중간';
  else if (/기말/.test(fileBody)) examRound = '기말';
  else if (/수행/.test(fileBody)) examRound = '수행평가';
  // 회차 키워드 없으면 examRound 는 '단원집' default 유지

  // 학교명 + 단원 분리: "동래중학교 - 수와 식_문제지" → ["동래중학교", "수와 식_문제지"]
  // 패턴: "<학교명> - <단원>_(문제지|정답지|빠른정답).pdf"
  // 1) 학교 - 단원 패턴 매치
  const mSchoolChapter = fileBody.match(/^([가-힣A-Za-z0-9]+(?:중학교|고등학교|초등학교|여중|남중|여고|남고|중|고|초))\s*-\s*([^_]+?)(?:_(?:문제지|정답지|빠른정답|시험지|해설지|답안지)?)?$/);
  if (mSchoolChapter) {
    schoolName = mSchoolChapter[1].trim();
    chapter = mSchoolChapter[2].trim();
  } else {
    // 2) fallback — 학교명만 추출 (단원 없음)
    const mSchool = fileBody.match(/^([가-힣A-Za-z0-9]+(?:중학교|고등학교|초등학교|여중|남중|여고|남고|중|고|초))/);
    if (mSchool) schoolName = mSchool[1].trim();
  }

  if (!schoolName) warnings.push('학교명 미감지');
  if (!chapter) warnings.push('단원 미감지');

  const schoolNameNormalized = normalizeSchoolName(schoolName);

  return {
    schoolLevel,
    grade,
    semester,
    district,
    sigungu,
    examYear,
    examMonth,
    schoolName,
    schoolNameNormalized,
    chapter,
    examRound,
    documentType,
    warnings,
  };
}

/**
 * FolderMetaResult → POST /api/workflow/upload 의 schoolMeta JSON 으로 변환.
 * NULL 필드는 제외 (자동 추출 fallback 이 처리하도록).
 */
export function toSchoolMetaPayload(m: FolderMetaResult): {
  schoolName?: string;
  district?: string;
  semester?: 1 | 2;
  examYear?: number;
  examRound?: string;
  chapter?: string;
} {
  const payload: Record<string, unknown> = {};
  if (m.schoolName) payload.schoolName = m.schoolName;
  if (m.district) payload.district = m.district;
  if (m.semester) payload.semester = m.semester;
  if (m.examYear) payload.examYear = m.examYear;
  if (m.examRound) payload.examRound = m.examRound;
  if (m.chapter) payload.chapter = m.chapter;
  return payload as ReturnType<typeof toSchoolMetaPayload>;
}
