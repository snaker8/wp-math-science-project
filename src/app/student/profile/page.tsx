'use client';

import { User } from 'lucide-react';
import { ChangePasswordCard } from '@/components/account/ChangePasswordCard';

// 목업 프로필("홍길동") 제거 — 실기능인 비밀번호 변경만 유지, 프로필 편집은 준비 중 (P0)
export default function StudentProfilePage() {
  return (
    <div className="p-4 space-y-6 max-w-md mx-auto">
      <section>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <User size={22} className="text-indigo-600" />
          내 정보
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          프로필 조회·수정 기능은 준비 중입니다. 비밀번호 변경은 아래에서 가능합니다.
        </p>
      </section>

      <ChangePasswordCard variant="light" />
    </div>
  );
}
