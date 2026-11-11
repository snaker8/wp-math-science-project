// ============================================================================
// 교재 자료실 — 파일 행들을 「과정 → 교재 → 파일 버튼」 으로 묶기
// ============================================================================

import type { TextbookLevel } from './access';

export type TextbookFileRow = {
  id: string;
  level: TextbookLevel;
  course: string;
  book: string;
  kind: string;
  edition: string | null;
  file_name: string;
  size_bytes: number;
};

export type CatalogFile = { id: string; kind: string; label: string; edition: string | null; ext: string; size: number };
export type CatalogBook = { book: string; editions: string[]; files: CatalogFile[] };
export type CatalogCourse = { level: TextbookLevel; course: string; books: CatalogBook[]; fileCount: number };

/** 과정 순서 — 학년 순. 목록에 없는 과정은 뒤에 이름순. */
export const COURSE_ORDER = [
  '중1-1', '중1-2', '중2-1', '중2-2', '중3-1', '중3-2',
  '공통수학1', '공통수학2', '공통수학1·2', '고등수학(상)', '고등수학(하)', '대수', '수학Ⅰ', '수학Ⅱ',
  '미적분Ⅰ', '미적분Ⅱ', '미적분', '확률과통계', '기하', '모의고사_고1', '모의고사_고2', '수능·평가원',
];

/** 한 교재 안 버튼 순서 — 본문이 맨 앞. */
export const KIND_ORDER = ['본문', '워크북', '빠른정답', '정답', '해설', '정오표', '교사용', '교사용부록', '전체'];

const rank = (list: string[], v: string) => {
  const i = list.indexOf(v);
  return i < 0 ? list.length : i;
};

export function courseSort(a: string, b: string): number {
  return rank(COURSE_ORDER, a) - rank(COURSE_ORDER, b) || a.localeCompare(b, 'ko');
}

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/**
 * 같은 종류가 둘 이상이면 판(개정·연도)으로, 판도 같으면 번호로 구분한 버튼 이름을 붙인다.
 * 예) 본문 · 본문 2023 / 해설 1 · 해설 2
 */
function labelFiles(files: Omit<CatalogFile, 'label'>[]): CatalogFile[] {
  const byKind = new Map<string, Omit<CatalogFile, 'label'>[]>();
  for (const f of files) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  const out: CatalogFile[] = [];
  for (const [kind, group] of byKind) {
    if (group.length === 1) {
      out.push({ ...group[0], label: kind });
      continue;
    }
    const editionCount = new Map<string, number>();
    for (const f of group) editionCount.set(f.edition ?? '', (editionCount.get(f.edition ?? '') ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const f of group) {
      const ed = f.edition ?? '';
      const n = (seen.get(ed) ?? 0) + 1;
      seen.set(ed, n);
      const unique = ed && editionCount.get(ed) === 1;
      out.push({ ...f, label: unique ? `${kind} ${ed}` : `${kind}${ed ? ` ${ed}` : ''} ${n}` });
    }
  }
  return out.sort((a, b) => rank(KIND_ORDER, a.kind) - rank(KIND_ORDER, b.kind) || a.label.localeCompare(b.label, 'ko'));
}

export function buildCatalog(rows: TextbookFileRow[]): CatalogCourse[] {
  const courses = new Map<string, { level: TextbookLevel; books: Map<string, TextbookFileRow[]> }>();
  for (const r of rows) {
    const key = `${r.level}|${r.course}`;
    if (!courses.has(key)) courses.set(key, { level: r.level, books: new Map() });
    const books = courses.get(key)!.books;
    books.set(r.book, [...(books.get(r.book) ?? []), r]);
  }
  const out: CatalogCourse[] = [];
  for (const [key, c] of courses) {
    const course = key.split('|')[1];
    const books: CatalogBook[] = [...c.books.entries()]
      .map(([book, files]) => ({
        book,
        editions: [...new Set(files.map((f) => f.edition).filter((e): e is string => !!e))].sort().reverse(),
        files: labelFiles(files.map((f) => ({
          id: f.id, kind: f.kind, edition: f.edition, ext: extOf(f.file_name), size: f.size_bytes,
        }))),
      }))
      .sort((a, b) => a.book.localeCompare(b.book, 'ko'));
    out.push({ level: c.level, course, books, fileCount: books.reduce((n, b) => n + b.files.length, 0) });
  }
  return out.sort((a, b) => (a.level === b.level ? courseSort(a.course, b.course) : a.level === '중등' ? -1 : 1));
}

/** 25.3MB 처럼 사람이 읽는 크기. */
export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)}MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))}KB`;
}
