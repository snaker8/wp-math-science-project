'use client';

// ============================================================================
// 표면 공용 부품 — 진단 리포트(report-primitives)의 설계 언어를 앱 전역용으로 추출.
//
// ★ 왜 (2026-07-23 실측)
//   같은 zinc 다크인데 진단 리포트만 고급스럽게 읽혔다. 차이는 색이 아니라 넷이었다.
//     1. 표면 — 불투명 단색(#1a1d28)이 아니라 반투명(zinc-900/40). 바탕이 비쳐 층이 생긴다
//     2. 위계 — 값과 라벨을 크게 벌린다 (2xl bold ↔ 10px uppercase tracking)
//     3. 여백 — p-5 / p-4. 앱 화면은 px-2 py-1.5 로 조밀했다
//     4. 반경 — rounded-xl 하나. 앱은 lg·md·rounded 혼재(전체 8종)
//   화면마다 손으로 맞추면 또 갈라지므로 값을 부품 안에 가둔다.
//
// ★ 규칙: 이 파일 밖에서 패널 배경·반경·여백을 직접 쓰지 말고 여기를 쓴다.
//   숫자에는 반드시 tabular-nums (자릿수 정렬).
// ============================================================================

import React from 'react';

/** 반경 한 벌 — 컨테이너 xl / 조작요소 lg. 이 둘 밖으로 나가지 않는다. */
export const RADIUS = {
  panel: 'rounded-xl',
  control: 'rounded-lg',
} as const;

/**
 * 패널 표면 — 배경·테두리만. 레이아웃(flex·높이·overflow)은 쓰는 쪽이 정한다.
 *
 * ★ 앱과 리포트가 정반대였다 (실측 2026-07-23)
 *     앱   : bg-surface-card/90 (거의 불투명) + border-subtle(흰 6%, 거의 안 보임)
 *            → 판은 꽉 찼는데 경계가 흐려 뭉개져 보인다
 *     리포트: bg-zinc-900/40 (많이 비침)      + border-zinc-800(또렷)
 *            → 판은 비치는데 경계가 분명해 "층"으로 읽힌다
 *   후자가 고급스럽게 읽힌 이유. 채움은 낮추고 경계는 올린다.
 *
 * 구조를 가진 컨테이너(사이드바·목록판 등)는 SurfacePanel 로 감싸면 여백이 끼어
 * 레이아웃이 깨지므로, 그런 곳엔 이 클래스만 얹는다.
 */
export const PANEL_SURFACE = 'border border-white/[.08] bg-surface-card/40';

/** 패널 안에 한 겹 더 들어가는 표면 (행 hover·내부 카드 등) */
export const PANEL_INSET = 'border border-white/[.06] bg-white/[.03]';

/**
 * 패널 — 카드·박스·목록 컨테이너의 기본 단위.
 * 반투명 표면 + 조용한 테두리. 배경 위에 "얹힌 판"이 아니라 "층"으로 보이게 한다.
 */
export function SurfacePanel({
  title, hint, right, children, className = '', padding = 'normal',
}: {
  title?: string;
  hint?: string;
  /** 헤더 우측 영역 (버튼·건수 등) */
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** normal = p-5(패널), tight = p-4(작은 카드) */
  padding?: 'normal' | 'tight';
}) {
  const pad = padding === 'tight' ? 'p-4' : 'p-5';
  return (
    <div className={`${RADIUS.panel} ${PANEL_SURFACE} ${pad} ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            {title && (
              <h3 className="truncate text-sm font-bold text-content-primary">{title}</h3>
            )}
            {hint && <span className="shrink-0 text-[10px] text-content-muted">{hint}</span>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * 지표 타일 — 값은 크게, 라벨은 작고 넓게. 그 사이에 중간 크기를 두지 않는다.
 * 보조 한 줄(sub)은 선택이지만 되도록 채운다 — 숫자만 있으면 판단이 안 된다.
 */
export function StatTile({
  label, value, sub, icon, tone = 'default', className = '',
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  /** 값 색. 의미가 있을 때만 쓴다 — 기본은 무채색 */
  tone?: 'default' | 'good' | 'caution' | 'weak' | 'accent';
  className?: string;
}) {
  const toneClass = {
    default: 'text-content-primary',
    good: 'text-emerald-300',
    caution: 'text-amber-300',
    weak: 'text-rose-300',
    accent: 'text-indigo-300',
  }[tone];

  return (
    <div className={`${RADIUS.panel} ${PANEL_SURFACE} p-4 ${className}`}>
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.11em] text-content-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-content-muted">{sub}</div>}
    </div>
  );
}

/**
 * 메타 배지 — 개수·코드처럼 짧은 부가 정보. 숫자는 등폭.
 * 색은 기본적으로 무채색. 강조가 필요할 때만 accent.
 */
export function MetaBadge({
  children, accent = false, className = '',
}: {
  children: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums
        ${accent
          ? 'bg-indigo-500/15 text-indigo-200'
          : 'bg-white/[.06] text-content-tertiary'} ${className}`}
    >
      {children}
    </span>
  );
}
