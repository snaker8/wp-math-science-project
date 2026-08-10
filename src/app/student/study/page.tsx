import ComingSoon from '@/components/shared/ComingSoon';

export default function StudentStudyPage() {
  return (
    <ComingSoon
      title="학습 기능 준비 중"
      description="맞춤 학습 기능을 준비하고 있습니다. 지금은 대시보드에서 시험과 학습 현황을 확인해주세요."
      backHref="/student/dashboard"
      backLabel="대시보드로 돌아가기"
    />
  );
}
