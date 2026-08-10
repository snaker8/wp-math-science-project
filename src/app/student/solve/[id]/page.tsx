import ComingSoon from '@/components/shared/ComingSoon';

export default function StudentSolvePage() {
  return (
    <ComingSoon
      title="문제 풀이 화면 준비 중"
      description="개별 문제 풀이 화면을 준비하고 있습니다. 시험 응시는 시험 탭에서 가능합니다."
      backHref="/student/exams"
      backLabel="시험 목록으로"
    />
  );
}
