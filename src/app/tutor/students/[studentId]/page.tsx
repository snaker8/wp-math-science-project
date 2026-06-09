'use client';

// ============================================================================
// /tutor/students/[studentId] — 학생 통합 상세 (풀페이지)
//   실제 내용은 StudentDetailContent 컴포넌트 — 성적 일람표의 모달 팝업과 동일 컴포넌트 재사용.
//   (풀페이지: min-h-screen 래퍼 / 모달: StudentDetailModal 래퍼)
// ============================================================================

import { useParams } from 'next/navigation';
import StudentDetailContent from '@/components/students/StudentDetailContent';

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = (params?.studentId as string) || '';
  return (
    <div className="min-h-screen bg-gray-50">
      <StudentDetailContent studentId={studentId} />
    </div>
  );
}
