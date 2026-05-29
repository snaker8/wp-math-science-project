'use client';

// ============================================================================
// ActiveInstituteSwitcher — TopNav 우측 활성 센터 선택 드롭다운
//
// SSR 절대 안 함 (TopNav 에서 next/dynamic + ssr:false 로 import).
// hydration mismatch 원천 차단.
// ============================================================================

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

export default function ActiveInstituteSwitcher() {
  const [activeId, setActiveId] = useState<string>('');
  const [institutes, setInstitutes] = useState<{ id: string; name: string }[]>(
    []
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/me/active-institute', {
          cache: 'no-store',
        });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        setActiveId(d.activeInstituteId ?? '');
        setInstitutes(d.institutes ?? []);
      } catch {
        // 무시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (institutes.length <= 1) return null;

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (!next || next === activeId || busy) return;
    setBusy(true);
    setActiveId(next);
    try {
      const r = await fetch('/api/me/active-institute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instituteId: next }),
      });
      if (r.ok) {
        // 전체 페이지 새로고침 — TopNav 좌측 학원/센터 라벨,
        // 학생 채점 페이지의 "등록 센터" 표시 등 모든 client component 가
        // 활성 institute 를 다시 fetch 하도록 강제
        window.location.reload();
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hidden md:flex items-center gap-1.5 mr-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
      <Building2 className="h-3 w-3 text-amber-400 shrink-0" />
      <select
        value={activeId}
        onChange={onChange}
        disabled={busy}
        className="bg-transparent text-[12px] font-bold text-amber-200 focus:outline-none cursor-pointer pr-1 max-w-[160px] truncate disabled:opacity-60"
        title="활성 센터 — 학생 채점, 자산화 등 모든 작업이 이 센터 기준"
      >
        {institutes.map((i) => (
          <option key={i.id} value={i.id} className="bg-zinc-900 text-white">
            {i.name}
          </option>
        ))}
      </select>
    </div>
  );
}
