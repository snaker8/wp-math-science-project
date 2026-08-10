// 학부모 구역 레이아웃 — 목업 헤더("김민수 학부모님")·목업 탭 제거 (P0).
// /parent/[token] 실데이터 리포트가 자체 UI를 갖고 있으므로 pass-through.
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
