import ComingSoon from '@/components/shared/ComingSoon';

export default function StudentClassesPage() {
  return (
    <ComingSoon
      title="반 목록 준비 중"
      description="등록된 반은 대시보드의 '내 반' 카드에서 확인할 수 있습니다."
      backHref="/student/dashboard"
      backLabel="대시보드로 돌아가기"
    />
  );
}
