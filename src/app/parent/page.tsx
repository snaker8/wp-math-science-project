import ComingSoon from '@/components/shared/ComingSoon';

export default function ParentHomePage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b border-gray-100 p-4 shadow-sm">
        <span className="font-serif font-bold text-xl text-slate-800">
          Parent<span className="text-indigo-600">Portal</span>
        </span>
      </header>
      <main className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <ComingSoon
          title="학부모 서비스 준비 중"
          description="자녀의 학습 리포트는 학원에서 보내드린 전용 링크로 확인하실 수 있습니다. 링크가 없다면 학원에 문의해주세요."
        />
      </main>
    </div>
  );
}
