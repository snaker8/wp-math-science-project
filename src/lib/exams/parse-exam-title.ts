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

// ── 검색 ───────────────────────────────────────────────────────────────────
//
// ★ 배경 (2026-11-14): 제목은 `24-2-1-F 사직고 수학2` 인데 대표는 「미적분1 기말」로 찾는다.
//   · 기말/중간은 제목에 F/M 한 글자로만 있다 → 「기말」 검색 0건.
//   · 2022 개정에서 과목 이름이 바뀌었다(수학2 → 미적분1). 수학비서는 옛 시험지를 새 이름으로
//     보여 주는데 우리는 시험 당시 제목 그대로라 「미적분1」로 찾으면 올해 치른 몇 장만 나왔다.
//   → 검색어를 띄어쓰기로 나눠 토막마다 (글자 포함) 또는 (뜻 일치)를 본다. 토막끼리는 AND.
//   기존 검색(공백 지운 글자 포함)에 걸리던 것은 전부 그대로 걸린다 — 결과가 늘기만 한다.

/** 과목 이름 정규화 — 공백·괄호 제거, 로마 숫자 → 아라비아 숫자, 줄임말 풀기 */
function normalizeSubject(s: string): string {
  let t = s.toLowerCase().replace(/[\s()（）]/g, '')
    .replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2')
    .replace(/ii$/, '2').replace(/i$/, '1');
  const SHORT: Record<string, string> = {
    '수1': '수학1', '수2': '수학2', '미적1': '미적분1', '미적2': '미적분2', '미적': '미적분',
    '공수1': '공통수학1', '공수2': '공통수학2', '수상': '수학상', '수하': '수학하',
    '확통': '확률과통계',
  };
  if (SHORT[t]) t = SHORT[t];
  return t;
}

/** 2015 개정 ↔ 2022 개정 — 같은 내용을 다루는 과목끼리 묶는다 */
const SUBJECT_GROUPS: string[][] = [
  ['공통수학1', '수학상'],
  ['공통수학2', '수학하'],
  ['대수', '수학1'],
  ['미적분1', '수학2'],
  ['미적분2', '미적분'],
];

function subjectAliases(token: string): string[] | null {
  const n = normalizeSubject(token);
  const g = SUBJECT_GROUPS.find((grp) => grp.includes(n));
  if (g) return g;
  // 묶음에 없는 줄임말(확통 등)은 풀어 쓴 이름 하나로
  return n !== token.toLowerCase() ? [n] : null;
}

/** 제목에서 과목 부분만 — 접두 코드와 학교명을 뗀 나머지 */
function titleSubject(title: string): string | null {
  const t = title.trim();
  const m = t.match(TITLE_RE);
  if (!m) return null;
  return normalizeSubject(t.slice(m[0].length));
}

function tokenMatches(token: string, flatTitle: string, parsed: ParsedExamTitle | null, subject: string | null): boolean {
  const tk = token.toLowerCase();
  if (flatTitle.includes(tk)) return true;

  if (parsed) {
    if (/^기말(고사)?$/.test(tk)) return parsed.kind === 'F';
    if (/^중간(고사)?$/.test(tk)) return parsed.kind === 'M';
    let m = tk.match(/^([12])학기$/);
    if (m) return parsed.term === m[1];
    m = tk.match(/^(중|고)([1-3])$/);
    if (m) return parsed.schoolLevel === m[1] && parsed.grade === m[2];
    m = tk.match(/^(?:20)?(\d{2})년(?:도)?$/) || tk.match(/^20(\d{2})$/);
    if (m) return parsed.year === m[1];
  }

  const aliases = subjectAliases(tk);
  if (aliases) {
    // 과목을 뽑을 수 있으면 정확히 비교한다 — 글자 포함으로 보면 「수학2」가 「공통수학2」에도 걸린다.
    //   뒤에 말이 붙은 제목(`수학2 재시험`)도 받되, 숫자가 이어지면 다른 과목이다(미적분 ≠ 미적분1).
    if (subject !== null) {
      return aliases.some((a) => subject === a || (subject.startsWith(a) && !/^\d/.test(subject.slice(a.length))));
    }
    const flatNorm = normalizeSubject(flatTitle);
    return aliases.some((a) => flatNorm.includes(a));
  }
  return false;
}

/**
 * 클라우드 목록 검색. 검색어가 비면 통과.
 * 토막마다: 제목에 글자가 있거나 / 기말·중간·학기·학년·연도·과목(옛↔새 이름)의 뜻이 맞으면 통과.
 */
export function matchesExamSearch(title: string | null | undefined, query: string): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const raw = title || '';
  const flatTitle = raw.toLowerCase().replace(/\s+/g, '');
  const parsed = parseExamTitle(raw);
  const subject = titleSubject(raw);
  return tokens.every((tk) => tokenMatches(tk, flatTitle, parsed, subject));
}
