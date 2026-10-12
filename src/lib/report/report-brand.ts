// ============================================================================
// 학부모 공유 리포트(/share/exam/[token]) — 디자인(버전) 과 학원 표기(아이덴티티) 분리
//
// ★ 2026-10-12 대표: "엄궁차수학 버전은 조금 달랐으면" → 학원별 변형.
// ★ 2026-10-13 대표: "엄궁차수학을 이름했는데 빼라, 그냥 디자인 설명만" / "네이비 골드가 무채색으로 나온다" /
//   "더 세련된 디자인이 있으면 추가해도 된다".
//   - 디자인(DESIGNS): 색·분위기. 공유 링크 만들 때 고른다(exams.share_report_variant). 이름이 들어가지 않는다.
//   - 아이덴티티(IDENTITIES): 학원 이름 칩·푸터·라벨. 시험지 소속 학원(organization.slug)으로만 자동 결정 —
//     과사람 시험지에 네이비 디자인을 골라도 「엄궁차수학」 글자는 안 붙는다.
//   CSS 는 report.css 의 `.report-shell[data-brand="<디자인 키>"]`.
// ============================================================================

export interface ReportDesign {
  key: string;
  label: string;
  desc: string;
  og: { bgFrom: string; bgTo: string; badgeFrom: string; badgeTo: string; badgeText: string; accent: string };
}

export interface ReportIdentity {
  name: string;
  eyebrow: string;
  footer?: string;
  ogLabel: string;
  defaultDesign: string;
  /** 헤더에 학원 이름 칩을 보일지 */
  showChip: boolean;
}

/** 클라이언트·OG 가 쓰는 합성 결과 (key = 디자인 키 = CSS data-brand) */
export interface ReportBrand {
  key: string;
  name: string;
  eyebrow: string;
  footer?: string;
  showChip: boolean;
  og: ReportDesign['og'] & { label: string };
}

export const DESIGNS: Record<string, ReportDesign> = {
  'cream-orange': {
    key: 'cream-orange',
    label: '크림 · 오렌지',
    desc: '따뜻한 크림 종이에 오렌지 포인트 (기본)',
    og: { bgFrom: '#fff7ed', bgTo: '#fed7aa', badgeFrom: '#fef3c7', badgeTo: '#fed7aa', badgeText: '#9a3412', accent: '#ea580c' },
  },
  'navy-gold': {
    key: 'navy-gold',
    label: '네이비 · 골드',
    desc: '네이비 헤더 띠에 골드 포인트, 격식 있는 톤',
    og: { bgFrom: '#1a2744', bgTo: '#2b3d63', badgeFrom: '#b89a5a', badgeTo: '#d4b978', badgeText: '#1a2744', accent: '#b89a5a' },
  },
  forest: {
    key: 'forest',
    label: '포레스트 · 세이지',
    desc: '딥 그린과 세이지, 차분하고 고급스러운 톤',
    og: { bgFrom: '#f3f6f2', bgTo: '#d9e6d6', badgeFrom: '#1f4d3a', badgeTo: '#2f6b52', badgeText: '#eaf3ec', accent: '#2f6b52' },
  },
  slate: {
    key: 'slate',
    label: '슬레이트 · 블루',
    desc: '회청색 바탕에 선명한 블루 포인트, 모던한 톤',
    og: { bgFrom: '#f8fafc', bgTo: '#dbeafe', badgeFrom: '#1e293b', badgeTo: '#334155', badgeText: '#e0f2fe', accent: '#2563eb' },
  },
  mono: {
    key: 'mono',
    label: '흑백 에디토리얼',
    desc: '색 없는 흑백, 가는 선 — 블로그·카페 게시용',
    og: { bgFrom: '#ffffff', bgTo: '#e7e7e7', badgeFrom: '#111111', badgeTo: '#333333', badgeText: '#ffffff', accent: '#111111' },
  },
};

/** 공유 링크 만들 때 고르는 버전 목록 (디자인 설명만, 학원 이름 없음) */
export const REPORT_VARIANTS: Array<{ key: string; label: string; desc: string }> = Object.values(DESIGNS).map((d) => ({ key: d.key, label: d.label, desc: d.desc }));

/** 옛 키 호환 (2026-10-12 하루 동안 학원 이름 키로 저장됐을 수 있음) */
const LEGACY_KEYS: Record<string, string> = { gwasaram: 'cream-orange', umgungsmt: 'navy-gold', editorial: 'mono' };

export function normalizeDesignKey(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const k = LEGACY_KEYS[v] ?? v;
  return k in DESIGNS ? k : null;
}

export function isReportVariant(v: unknown): v is string {
  return normalizeDesignKey(v) !== null;
}

const GWASARAM_IDENTITY: ReportIdentity = {
  name: '과사람',
  eyebrow: 'EXAM ANALYSIS REPORT',
  ogLabel: '학교 기출 분석',
  defaultDesign: 'cream-orange',
  showChip: false,
};

/** organizations.slug → 학원 표기. 모르는 학원·공통풀은 과사람 기본(이름 노출 없음). */
const IDENTITIES: Record<string, ReportIdentity> = {
  gwasaram: GWASARAM_IDENTITY,
  umgungsmt: {
    name: '엄궁차수학',
    eyebrow: '엄궁차수학 · 내신 기출 분석',
    footer: '엄궁차수학 수학전문 · 본 리포트는 학교 기출 시험지를 유형·난이도 기준으로 분석한 자료입니다.',
    ogLabel: '엄궁차수학 기출 분석',
    defaultDesign: 'navy-gold',
    showChip: true,
  },
};

export function composeBrand(design: ReportDesign, identity: ReportIdentity): ReportBrand {
  return {
    key: design.key,
    name: identity.name,
    eyebrow: identity.eyebrow,
    footer: identity.footer,
    showChip: identity.showChip,
    og: { ...design.og, label: identity.ogLabel },
  };
}

export const DEFAULT_BRAND: ReportBrand = composeBrand(DESIGNS['cream-orange'], GWASARAM_IDENTITY);

/** 학원(slug)만으로 — 디자인은 그 학원 기본 */
export function resolveReportBrand(orgSlug: string | null | undefined): ReportBrand {
  const identity = (orgSlug && IDENTITIES[orgSlug]) || GWASARAM_IDENTITY;
  return composeBrand(DESIGNS[identity.defaultDesign] || DESIGNS['cream-orange'], identity);
}

/** 저장된 디자인(variant)이 있으면 그 디자인 + 학원 표기는 slug 로. 없으면 학원 기본 디자인. */
export function resolveReportVariant(variant: string | null | undefined, orgSlug: string | null | undefined): ReportBrand {
  const identity = (orgSlug && IDENTITIES[orgSlug]) || GWASARAM_IDENTITY;
  const designKey = normalizeDesignKey(variant) || identity.defaultDesign;
  return composeBrand(DESIGNS[designKey] || DESIGNS['cream-orange'], identity);
}
