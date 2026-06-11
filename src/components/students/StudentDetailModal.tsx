'use client';

// ============================================================================
// StudentDetailModal — 학생 통합 상세를 팝업(모달)로. 성적 일람표에서 학생 클릭 시 사용.
//   풀페이지(/tutor/students/[id])와 동일한 StudentDetailContent 재사용 — 디자인 통일.
//   오버레이/X 클릭으로 닫힘. 내부 스크롤(밑에 인라인으로 깔려 스크롤하던 문제 해소).
// ============================================================================

import StudentDetailContent from './StudentDetailContent';

export default function StudentDetailModal({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-surface-card rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl border border-white/10 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <StudentDetailContent studentId={studentId} onClose={onClose} />
      </div>
    </div>
  );
}
