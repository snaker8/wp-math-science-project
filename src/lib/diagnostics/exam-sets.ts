// ============================================================================
// 진단평가 세트(A/B/C) 식별 + 신원 병합 헬퍼
//
// 배경:
//   - 진단평가는 같은 단원 범위를 A/B/C 변형(쌍/세트)으로 출제 → 한 학생이
//     A·B·C 를 나눠 치고, 합산해야 "종합 리포트"가 완성된다.
//   - book_group_id 만으론 부족: 한 book_group(예: "중2") 안에 서로 다른 세트
//     (사직여중 세트 + 중2-1 일반 세트)가 혼재. → 세트 키 = book_group_id +
//     "제목에서 변형 글자(진단평가A/B/C → 진단평가) 제거" 의 조합으로 식별.
//   - 채점된 학생 식별자는 users.id 또는 roster_students.id 양쪽에 존재하고,
//     roster_students.promoted_user_id 로 정식 user 와 연결될 수 있다. 동일
//     학생이 user 로 A, 연결된 roster 로 B 를 친 경우 → 신원 병합해 A+B 합산.
//     (analytics route 와 동일 정책)
// ============================================================================

// ★ 변형 글자 일반화 (③): A/B/C 하드코딩 제거 → 단일 영문 대문자 또는 숫자 변형 허용.
//   "진단평가A/B/C" 뿐 아니라 "진단평가D", "진단평가1/2/3" 등도 한 세트의 변형으로 묶임.
//   (?![가-힣]) 로 "진단평가1차" 같이 뒤에 한글이 붙는 경우는 변형으로 안 봄.
const VARIANT_RE = /진단평가\s*([A-Z0-9])(?![가-힣])/u;

/** 진단평가 제목에서 변형 글자(A/B/C/D/1/2…)를 제거한 "세트 정규화 제목". */
export function normalizeSetTitle(title: string): string {
  // "중2-1 F 진단평가A(...)" → "중2-1 F 진단평가(...)"
  return (title || '').replace(VARIANT_RE, '진단평가').trim();
}

/** 진단평가 제목에서 변형 글자 추출. 없으면 null. (A/B/C 외 임의 변형 허용) */
export function extractVariant(title: string): string | null {
  const m = (title || '').match(VARIANT_RE);
  return m?.[1] ?? null;
}

/** 세트 키 — book_group_id 와 정규화 제목 결합 (URL/식별 안전). */
export function makeSetKey(bookGroupId: string | null, setTitle: string): string {
  return `${bookGroupId ?? 'none'}::${setTitle}`;
}

export interface DiagnosticExamRow {
  id: string;
  title: string;
  book_group_id: string | null;
  institute_id: string | null;
}

export interface ExamSetVariant {
  examId: string;
  variant: string | null; // A/B/C/D/1/2… (일반화) 또는 null(변형 표기 없음)
  title: string;
}

export interface ExamSet {
  setKey: string;
  bookGroupId: string | null;
  bookGroupName: string | null;
  setTitle: string;        // 정규화 제목 (변형 글자 제거)
  variants: ExamSetVariant[];
}

/**
 * is_diagnostic exam 목록을 세트(book_group_id + 정규화 제목)로 그룹화.
 * 변형은 A→B→C→(null) 순으로 정렬.
 */
export function groupExamsIntoSets(
  exams: DiagnosticExamRow[],
  bookGroupNameById: Map<string, string>,
): ExamSet[] {
  const map = new Map<string, ExamSet>();
  for (const e of exams) {
    const setTitle = normalizeSetTitle(e.title);
    const key = makeSetKey(e.book_group_id, setTitle);
    let set = map.get(key);
    if (!set) {
      set = {
        setKey: key,
        bookGroupId: e.book_group_id,
        bookGroupName: e.book_group_id ? bookGroupNameById.get(e.book_group_id) ?? null : null,
        setTitle,
        variants: [],
      };
      map.set(key, set);
    }
    set.variants.push({ examId: e.id, variant: extractVariant(e.title), title: e.title });
  }
  // 변형 정렬 — 변형 글자 사전순(A<B<C<D, 0<1<2), 변형 없는 것(null)은 뒤로.
  for (const set of map.values()) {
    set.variants.sort((a, b) => {
      if (a.variant && b.variant) return a.variant.localeCompare(b.variant);
      if (a.variant) return -1;
      if (b.variant) return 1;
      return a.title.localeCompare(b.title);
    });
  }
  return Array.from(map.values()).sort((a, b) => a.setTitle.localeCompare(b.setTitle));
}
