// ============================================================================
// DashboardRouteSkeleton — 대시보드 라우트 전환 시 Suspense fallback (loading.tsx)
// ----------------------------------------------------------------------------
// 목적(2026-07-02 전환 속도감 개선):
//   prod 에서 모든 대시보드 페이지는 [track] 동적 세그먼트라 Dynamic(λ) →
//   loading.tsx 경계가 없으면 <Link> prefetch 가 무력화되고, 클릭 후 서버 왕복이
//   끝날 때까지 화면이 "이전 페이지에 멈춤". 이 fallback 이 있으면:
//     ⓐ 클릭 즉시 스켈레톤 노출(즉각 피드백)
//     ⓑ 동적 라우트도 이 경계까지 prefetch 활성화 → 실제 콘텐츠도 빨리 도착
//
// 레이아웃((tracks)/[track]/dashboard/layout.tsx)이 이미 TopNav + <main> 컨테이너
// (mx-auto max-w-screen-2xl, px/py)를 감싸고 있으므로, 여기서는 콘텐츠 내부만 렌더.
// 순수 표현용(hooks 없음) → 서버 컴포넌트로 가볍게. 특정 페이지에 종속되지 않는
// 중립적 형태(제목 + 지표 카드 행 + 카드 그리드)로 대부분 대시보드 화면을 근사.
// ============================================================================

export default function DashboardRouteSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {/* 제목 + 부제 */}
      <div className="mb-6 space-y-3">
        <div className="h-7 w-56 rounded-lg bg-white/10" />
        <div className="h-4 w-80 rounded bg-white/5" />
      </div>

      {/* 지표 카드 행 (대시보드·리포트 상단 근사) */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/5 bg-surface-card p-4"
          >
            <div className="mb-3 h-3 w-20 rounded bg-white/5" />
            <div className="h-8 w-16 rounded-lg bg-white/10" />
          </div>
        ))}
      </div>

      {/* 필터/툴바 행 */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-9 w-40 rounded-lg bg-white/10" />
        <div className="h-9 w-28 rounded-lg bg-white/5" />
        <div className="ml-auto h-9 w-24 rounded-lg bg-white/5" />
      </div>

      {/* 카드 그리드 (클라우드·저장소·문제은행 목록 근사) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/5 bg-surface-card p-4"
          >
            <div className="mb-3 h-28 w-full rounded-lg bg-white/5" />
            <div className="mb-2 h-4 w-3/4 rounded bg-white/10" />
            <div className="mb-3 h-3 w-1/2 rounded bg-white/5" />
            <div className="flex gap-2">
              <div className="h-5 w-12 rounded-full bg-white/5" />
              <div className="h-5 w-16 rounded-full bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
