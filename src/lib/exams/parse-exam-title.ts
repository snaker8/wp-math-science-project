// ============================================================================
// 시험지 제목 파서 — `23-3-1-F 이사벨중 수학` 한 줄에서 여섯 축을 뽑는다.
//
// ★ 배경 (2026-07-23): 클라우드 폴더 트리가 계층을 하나만 표현할 수 있어,
//   같은 학교 자료가 여러 폴더로 흩어지던 문제(운영 실측: 47개 학교 중 19개가
//   2~5개 폴더에 분산. 학장중 12건 = 폴더 4곳). 그런데 그 축들이 이미 제목에
//   들어 있다 — 운영 195건 중 147건(75%)이 이 형식.
//   → 폴더를 없애지 않고, "좁히는 일"만 제목 기반 조건으로 넘긴다.
//   DB 변경·재분류·마이그레이션 없이 읽기만 한다.
// ============================================================================

export type ExamKind = 'M' | 'F'; // 중간 / 기말
export type SchoolLevel = '중' | '고';

export interface ParsedExamTitle {
  /** 2자리 연도 ('23' = 2023). 원본 표기를 그대로 둔다 — 칩 라벨·정렬 양쪽에 쓰임 */
  year: string;
  /** 학년 숫자 ('1'~'3'). 중/고 구분은 schoolLevel 이 따로 가진다 */
  grade: string;
  /** 학기 ('1' | '2') */
  term: string;
  /** 중간(M) / 기말(F) */
  kind: ExamKind;
  /** 학교명 ('이사벨중'). 제목의 접두 코드 뒤 첫 토막 */
  school: string;
  /** 학교명 어미로 추정한 학교급. 판단 불가면 null */
  schoolLevel: SchoolLevel | null;
}

/**
 * `YY-G-T-K 학교명 ...` 형식만 인정한다.
 * 느슨하게 잡으면 교재 제목(`쎈 중2-1` 등)이 걸려 엉뚱한 축이 생긴다.
 *
 * ★ 구분자는 공백과 하이픈 둘 다 — 운영 데이터에 두 표기가 섞여 있다 (실측 2026-07-23):
 *   `23-3-1-F 이사벨중 수학` (공백) 132건 / `26-2-1-M-분포중 수학` (하이픈) 15건.
 *   공백만 받으면 하이픈 표기 15건이 통째로 조건에서 빠진다.
 */
const TITLE_RE = /^(\d{2})-([1-9])-([12])-([FMfm])[\s-]+([^\s-]\S*)/;

/** 학교명 어미 → 학교급. '여중'·'중'은 중, '여고'·'고'는 고. */
function detectSchoolLevel(school: string): SchoolLevel | null {
  if (/(중학교|여중|중)$/.test(school)) return '중';
  if (/(고등학교|여고|고)$/.test(school)) return '고';
  return null;
}

/**
 * 제목에서 여섯 축 추출. 형식이 아니면 null (교재류 등 — 폴더·검색이 담당).
 */
export function parseExamTitle(title: string | null | undefined): ParsedExamTitle | null {
  if (!title) return null;
  const m = title.trim().match(TITLE_RE);
  if (!m) return null;
  const school = m[5];
  return {
    year: m[1],
    grade: m[2],
    term: m[3],
    kind: m[4].toUpperCase() as ExamKind,
    school,
    schoolLevel: detectSchoolLevel(school),
  };
}

// ── 표시용 라벨 ────────────────────────────────────────────────────────────

export function kindLabel(kind: ExamKind): string {
  return kind === 'F' ? '기말' : '중간';
}

export function yearLabel(year: string): string {
  return `20${year}`;
}

/** 칩·배지에 쓰는 짧은 요약 ('25 중3-1 기말') */
export function shortSummary(p: ParsedExamTitle): string {
  const lv = p.schoolLevel ?? '';
  return `${p.year} ${lv}${p.grade}-${p.term} ${kindLabel(p.kind)}`;
}

// ── 조건(패싯) 선택 상태 ───────────────────────────────────────────────────

/** 축별로 고른 값들. 빈 배열 = 그 축은 제한 없음 */
export interface ExamFacetSelection {
  year: string[];
  grade: string[];
  term: string[];
  kind: string[];
  level: string[];
}

export const EMPTY_FACET_SELECTION: ExamFacetSelection = {
  year: [], grade: [], term: [], kind: [], level: [],
};

export function hasAnyFacet(sel: ExamFacetSelection): boolean {
  return (
    sel.year.length > 0 || sel.grade.length > 0 || sel.term.length > 0 ||
    sel.kind.length > 0 || sel.level.length > 0
  );
}

/** 축 하나에서 값 토글 (있으면 빼고 없으면 넣음). 원본 불변. */
export function toggleFacet(
  sel: ExamFacetSelection,
  axis: keyof ExamFacetSelection,
  value: string,
): ExamFacetSelection {
  const cur = sel[axis];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return { ...sel, [axis]: next };
}

/**
 * 조건 통과 여부.
 * ★ 파싱 안 되는 제목(교재류)은 조건이 하나라도 걸리면 제외한다.
 *   "중3만" 을 골랐는데 학년 모를 자료가 섞여 나오면 조건이 무의미해지기 때문.
 *   조건이 하나도 없으면 전부 통과 → 기존 목록과 완전히 동일.
 */
export function matchesFacets(
  parsed: ParsedExamTitle | null,
  sel: ExamFacetSelection,
): boolean {
  if (!hasAnyFacet(sel)) return true;
  if (!parsed) return false;
  if (sel.year.length && !sel.year.includes(parsed.year)) return false;
  if (sel.grade.length && !sel.grade.includes(parsed.grade)) return false;
  if (sel.term.length && !sel.term.includes(parsed.term)) return false;
  if (sel.kind.length && !sel.kind.includes(parsed.kind)) return false;
  if (sel.level.length && (!parsed.schoolLevel || !sel.level.includes(parsed.schoolLevel))) return false;
  return true;
}

// ── 후보값 집계 ────────────────────────────────────────────────────────────

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface FacetOptions {
  level: FacetOption[];
  grade: FacetOption[];
  term: FacetOption[];
  kind: FacetOption[];
  year: FacetOption[];
  /** 제목 형식이 아니라 조건으로 못 거르는 항목 수 (교재류) */
  unparsed: number;
}

/**
 * 현재 목록에서 실제로 존재하는 후보값 + 건수만 만든다.
 * 없는 값은 칩으로 내보내지 않는다 — 누르면 0건 되는 칩은 방해만 된다.
 */
export function buildFacetOptions(parsedList: Array<ParsedExamTitle | null>): FacetOptions {
  const count = (pick: (p: ParsedExamTitle) => string | null) => {
    const map = new Map<string, number>();
    let unparsed = 0;
    for (const p of parsedList) {
      if (!p) { unparsed++; continue; }
      const v = pick(p);
      if (v == null) continue;
      map.set(v, (map.get(v) ?? 0) + 1);
    }
    return map;
  };

  const toOptions = (
    map: Map<string, number>,
    label: (v: string) => string,
    sort: (a: string, b: string) => number,
  ): FacetOption[] =>
    [...map.keys()].sort(sort).map((v) => ({ value: v, label: label(v), count: map.get(v) ?? 0 }));

  const asc = (a: string, b: string) => a.localeCompare(b);
  const desc = (a: string, b: string) => b.localeCompare(a);

  return {
    level: toOptions(count((p) => p.schoolLevel), (v) => `${v}등`, asc),
    grade: toOptions(count((p) => p.grade), (v) => `${v}학년`, asc),
    term: toOptions(count((p) => p.term), (v) => `${v}학기`, asc),
    kind: toOptions(count((p) => p.kind), (v) => kindLabel(v as ExamKind), asc),
    // 최근 연도가 앞 — 보통 최신 자료를 먼저 찾는다
    year: toOptions(count((p) => p.year), (v) => v, desc),
    unparsed: parsedList.filter((p) => !p).length,
  };
}
