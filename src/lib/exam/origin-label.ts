// ============================================================================
// 문항 출처 표시 — 「상산고 2021 고1-1 기말 수학상 14번」
//
// 문항은 처음 자산화된 시험지(학교기출·모의고사·시중교재) 하나에 붙어 있고, 출제하면 새 시험지에 한 번 더 연결된다.
// 인쇄에서 「출처」를 켜면 그 원래 시험지 제목 + 원래 번호를 문제 위에 작게 찍는다(수학비서 「출처 노출」 대응).
// 유사·변형 시험지(우리가 만든 쌍둥이)는 원래 기출이 아니므로 출처를 만들지 않는다 — 「상산고 기출」로 잘못 찍히면 안 된다.
// ============================================================================

export type OriginKind = 'school' | 'mock' | 'textbook';

export interface OriginInfo {
  label: string;
  kind: OriginKind;
}

/** 출처가 될 수 있는 시험지 종류 (exams.exam_type) */
export const ORIGIN_EXAM_TYPES: Record<string, OriginKind> = {
  학교기출: 'school',
  모의고사: 'mock',
  시중교재: 'textbook',
};

const VARIANT_RE = /유사|변형|쌍둥이|AI\s*생성/;

/**
 * 시험지 제목 → 사람이 읽는 출처.
 *  - 학교기출 `21-1-1-F 상산고 수학상` → `상산고 2021 고1-1 기말 수학상`
 *    (학교명이 「중」으로 끝나면 `중2-1`)
 *  - 모의고사 `25-05 교육청 고3 확률과 통계` → `2025년 5월 교육청 고3 확률과 통계`
 *  - 형식이 다르면 제목 그대로
 */
export function formatOriginTitle(title: string, kind: OriginKind): string {
  const t = (title || '').trim();
  if (kind === 'school') {
    const m = t.match(/^(\d{2})-(\d)-(\d)-([MF])\s+(\S+)\s*(.*)$/);
    if (m) {
      const [, yy, g, s, mf, school, subject] = m;
      const level = /중$/.test(school) ? '중' : /초$/.test(school) ? '초' : '고';
      return [school, `20${yy}`, `${level}${g}-${s}`, mf === 'M' ? '중간' : '기말', subject.trim()]
        .filter(Boolean)
        .join(' ');
    }
  }
  if (kind === 'mock') {
    const m = t.match(/^(\d{2})-(\d{1,2})\s+(.*)$/);
    if (m) return `20${m[1]}년 ${Number(m[2])}월 ${m[3].trim()}`;
  }
  return t;
}

/** 원래 시험지 + 원래 번호 → 출처. 출처가 될 수 없으면 null */
export function buildOrigin(
  exam: { title: string | null; exam_type: string | null } | null | undefined,
  number: number | null | undefined,
): OriginInfo | null {
  if (!exam?.title) return null;
  const kind = ORIGIN_EXAM_TYPES[(exam.exam_type || '').trim()];
  if (!kind) return null;
  if (VARIANT_RE.test(exam.title)) return null;
  const base = formatOriginTitle(exam.title, kind);
  if (!base) return null;
  return { label: number ? `${base} ${number}번` : base, kind };
}
