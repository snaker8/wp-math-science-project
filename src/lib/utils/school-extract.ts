// ============================================================================
// School Name Extractor — exams.title에서 학교명 자동 추출
// 예: "26 신곡중 3-1 중간" → "신곡중"
//     "21 경남여고 수2 1학기 중간" → "경남여고"
//     "23-2-1-M 사직여중 수학" → "사직여중"
//     "[22년][1-1][기말][해운대고][수학상]" → "해운대고"   (2026-11-04 보강)
//     "24-2-1-M 엄궁중수학" / "25학년 엄궁중2 2학기" → "엄궁중"
// ============================================================================

import { normalizeSchoolName } from './school-normalize';

/** 학교처럼 생겼지만 학교가 아닌 흔한 단어 (2026-11-04 감사: "최고 난도 해운대고" → "최고") */
const STOPWORDS = new Set(['참고', '최고', '집중', '보고', '진행중', '비고', '재고', '중고', '초고', '고']);

/**
 * 시험지 제목에서 학교명 추출. 못 찾으면 null.
 *
 * 2026-11-04 보강:
 *  - 후보를 전부 모아 **제목에서 가장 앞에 나온 것**을 고른다 (종전엔 여중·여고 패턴을 무조건 먼저 봐
 *    "해운대고 … (해운대여고 참고)" 가 해운대여고로 잡혔다).
 *  - 단음절 접미사(중·고·초) 뒤 경계에 공백·-·_ 외에 `] ) , . ·` 와 숫자·과목명 시작을 허용.
 *  - 불용어(참고·최고·집중 …) 제외.
 */
export function extractSchoolName(title: string): string | null {
  if (!title) return null;

  const patterns: RegExp[] = [
    /([가-힣]{1,6}(?:여자중학교|여자고등학교|여자중|여자고|여중|남중|여고|남고))/g,
    /([가-힣]{1,6}(?:중학교|고등학교|초등학교))/g,
    // 단음절 접미사 — 뒤에 단어 경계(공백·구두점·괄호·숫자) 또는 과목명이 바로 붙는 경우("엄궁중수학")
    /([가-힣]{1,6}(?:중|고|초))(?=[\s\-_\]\[)(,.·/]|\d|$|수학|대수|기하|미적|확통|확률|공통|과학|물리|화학|생명|지구)/g,
  ];

  let best: { idx: number; name: string } | null = null;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(title)) !== null) {
      const name = m[1];
      if (name.length < 2 || STOPWORDS.has(name)) continue;
      // "학교기출" 같은 꼬리표의 "기출" 은 접미사가 아니라 통과 안 됨. "중고" 처럼 접미사만 있는 2자도 제외.
      if (/^(?:여자|여|남)?(?:중|고|초)(?:학교|등학교)?$/.test(name)) continue;
      const idx = m.index;
      if (!best || idx < best.idx || (idx === best.idx && name.length > best.name.length)) best = { idx, name };
    }
  }
  return best ? best.name : null;
}

/**
 * 시험지 한 장의 학교명 확정 — DB 컬럼(school_name) 우선, 없으면 제목에서 추출. 둘 다 표기 통일.
 * 리포트 집계는 이 함수로만 학교를 정한다 (2026-11-04: 부산중앙여고/중앙여고 가 카드 두 장으로 갈리던 것).
 */
export function resolveSchoolName(exam: { title: string | null; school_name?: string | null }): string | null {
  const fromCol = normalizeSchoolName(exam.school_name);
  if (fromCol) return fromCol;
  return normalizeSchoolName(extractSchoolName(exam.title || '') || '');
}

/**
 * 학교 분류 — '중학교' / '고등학교' / '초등학교' / '미분류'
 * ★ 끝 글자로만 판정. 종전 `startsWith('초')` 는 초량중·초읍중을 초등으로 분류했다 (2026-11-04).
 */
export function classifySchoolLevel(school: string | null): '초' | '중' | '고' | '대' | '미분류' {
  if (!school) return '미분류';
  if (school.includes('초등학교') || /초$/.test(school)) return '초';
  if (school.includes('중학교') || /(?:여중|남중|중)$/.test(school)) return '중';
  if (school.includes('고등학교') || /(?:여고|남고|고)$/.test(school)) return '고';
  if (school.includes('대학교') || /대$/.test(school)) return '대';
  return '미분류';
}
