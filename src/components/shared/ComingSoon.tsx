'use client';

// ============================================================================
// ComingSoon — 미구현 라우트의 정직한 안내 화면 (학생/학부모 라이트 톤).
// 목업 데이터를 실사용자에게 노출하지 않기 위한 P0 교체용.
// ============================================================================

import Link from 'next/link';
import { Construction, ArrowLeft } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}

export default function ComingSoon({
  title,
  description = '이 기능은 아직 준비 중입니다. 조금만 기다려주세요.',
  backHref,
  backLabel = '돌아가기',
}: ComingSoonProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-5">
        <Construction size={28} />
      </div>
      <h1 className="text-lg font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{description}</p>
      {backHref && (
        <Link
          href={backHref}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      )}
    </div>
  );
}
