// ============================================================================
// 학부모 공유 리포트(/share/exam/[token]) 학원별 브랜드
//
// ★ 2026-10-12 대표: "시험지 분석 학부모 리포트 형식이 모두 같은데 엄궁차수학 버전은 조금 달랐으면".
//   시험지 → institute → organization.slug 로 학원을 알아내고, 학원마다 라벨·색·푸터를 바꾼다.
//   과사람(기본)은 종전 그대로(오렌지·크림, 푸터 없음). 엄궁차수학은 report-send-pages 스킬에서 이미 쓰는
//   브랜드색(네이비 #1a2744 · 골드 #b89a5a)을 그대로 — 학부모가 받는 다른 페이지와 같은 결.
//   CSS 는 report.css 의 `.report-shell[data-brand="…"]` 변수 오버라이드. 새 학원은 여기 한 줄 + CSS 블록 하나.
// ============================================================================

export interface ReportBrand {
  /** organizations.slug — CSS data-brand 키 */
  key: string;
  /** 학원 이름 (헤더·푸터) */
  name: string;
  /** 헤더 작은 라벨 */
  eyebrow: string;
  /** 푸터 한 줄 (없으면 푸터 미표시 — 과사람 종전 그대로) */
  footer?: string;
  /** OG 썸네일 색 (og-image.tsx) */
  og: { bgFrom: string; bgTo: string; badgeFrom: string; badgeTo: string; badgeText: string; accent: string; label: string };
}

export const DEFAULT_BRAND: ReportBrand = {
  key: 'gwasaram',
  name: '과사람',
  eyebrow: 'EXAM ANALYSIS REPORT',
  og: { bgFrom: '#fff7ed', bgTo: '#fed7aa', badgeFrom: '#fef3c7', badgeTo: '#fed7aa', badgeText: '#9a3412', accent: '#ea580c', label: '학교 기출 분석' },
};

const BRANDS: Record<string, ReportBrand> = {
  gwasaram: DEFAULT_BRAND,
  umgungsmt: {
    key: 'umgungsmt',
    name: '엄궁차수학',
    eyebrow: '엄궁차수학 · 내신 기출 분석',
    footer: '엄궁차수학 수학전문 · 본 리포트는 학교 기출 시험지를 유형·난이도 기준으로 분석한 자료입니다.',
    og: { bgFrom: '#f4f5f8', bgTo: '#dfe3ec', badgeFrom: '#1a2744', badgeTo: '#2b3d63', badgeText: '#f5e9c8', accent: '#b89a5a', label: '엄궁차수학 기출 분석' },
  },
  // ★ 2026-10-12 세 번째 버전 — 학원색 없는 무채 에디토리얼 (블로그·카페 게시용, 어느 학원이든 중립)
  editorial: {
    key: 'editorial',
    name: '기출 분석',
    eyebrow: 'EXAM ANALYSIS · EDITORIAL',
    og: { bgFrom: '#ffffff', bgTo: '#e7e7e7', badgeFrom: '#111111', badgeTo: '#333333', badgeText: '#ffffff', accent: '#111111', label: '학교 기출 분석' },
  },
};

/** ★ 공유 링크 만들 때 고를 수 있는 리포트 버전 (2026-10-12 대표: "링크 리포트 버전을 여러 개 선택할 수 있게") */
export const REPORT_VARIANTS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'gwasaram', label: '과사람 (오렌지)', desc: '따뜻한 크림·오렌지, 푸터 없음' },
  { key: 'umgungsmt', label: '엄궁차수학 (네이비·골드)', desc: '학원 칩·푸터 포함' },
  { key: 'editorial', label: '에디토리얼 (무채)', desc: '학원색 없는 흑백 — 블로그·카페 게시용' },
];

export function isReportVariant(v: unknown): v is string {
  return typeof v === 'string' && v in BRANDS;
}

/** 시험지에 저장된 버전이 있으면 그것, 없으면 학원(slug) 자동 */
export function resolveReportVariant(variant: string | null | undefined, orgSlug: string | null | undefined): ReportBrand {
  if (isReportVariant(variant)) return BRANDS[variant];
  return resolveReportBrand(orgSlug);
}

/** organizations.slug → 브랜드. 모르는 학원·공통풀(institute 없음)은 과사람 기본. */
export function resolveReportBrand(orgSlug: string | null | undefined): ReportBrand {
  if (!orgSlug) return DEFAULT_BRAND;
  return BRANDS[orgSlug] ?? DEFAULT_BRAND;
}
