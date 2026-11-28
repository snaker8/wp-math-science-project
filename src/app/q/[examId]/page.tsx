'use client';

// /q/[examId] — 인쇄물 QR 이 여는 주소. ★ 책에 찍히므로 주소 모양을 바꾸지 말 것 (lib/qr/generator).
//   로그인 안 했으면 미들웨어가 /auth/login?redirect=/q/... 로 보내고, 로그인 뒤 여기로 돌아온다.
//   여기서는 갈 곳만 묻고(POST /api/student/qr/[examId]) 바로 넘긴다.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function QrEntryPage() {
  const params = useParams();
  const examId = (params?.examId as string) || '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/student/qr/${examId}`, { method: 'POST' });
        if (r.status === 401) {
          window.location.replace(`/auth/login?redirect=${encodeURIComponent(`/q/${examId}`)}`);
          return;
        }
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.redirect) throw new Error(data.error || '학습지를 열지 못했습니다');
        if (!cancelled) window.location.replace(data.redirect);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [examId]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-white px-6">
      {error ? (
        <div className="max-w-sm text-center">
          <p className="text-lg font-bold text-gray-900">학습지를 열 수 없어요</p>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <a href="/student/assignments" className="mt-6 inline-block rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white">
            내 과제로 가기
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="animate-spin" size={22} />
          <span className="text-base font-medium">학습지를 여는 중…</span>
        </div>
      )}
    </main>
  );
}
