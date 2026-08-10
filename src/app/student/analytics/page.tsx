import ComingSoon from '@/components/shared/ComingSoon';

export default function StudentAnalyticsPage() {
  return (
    <ComingSoon
      title="학습 분석 준비 중"
      description="단원별 성취도 분석 화면을 준비하고 있습니다. 시험 결과는 시험 탭에서 확인해주세요."
      backHref="/student/dashboard"
      backLabel="대시보드로 돌아가기"
    />
  );
}
