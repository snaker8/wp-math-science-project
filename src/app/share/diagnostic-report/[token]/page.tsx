'use client';

// ============================================================================
// /share/diagnostic-report/[token] — 학부모 공개 종합 리포트 (로그인 불필요)
//   토큰으로 /api/share/diagnostic-report/[token] 호출 → ComprehensiveReportView 렌더.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, BarChart3, AlertCircle } from 'lucide-react';
import { ComprehensiveReportView, type ComprehensiveReportPayload } from '@/components/diagnostics/ComprehensiveReportView';

export default function Page() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [report, setReport] = useState<ComprehensiveReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/share/diagnostic-report/${token}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setReport(data.report);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <header className="border-b border-zinc-800/50 bg-gradient-to-r from-indigo-900/40 via-cyan-900/30 to-zinc-900/30 px-4 sm:px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10">
            <BarChart3 className="h-6 w-6 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">진단평가 종합 리포트</h1>
              <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">학부모 공유</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">과사람 수학 · 자녀의 진단평가 결과를 분석한 리포트입니다</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-16 text-center text-zinc-500 flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={18} /> 리포트 불러오는 중…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-12 text-center text-rose-300 text-sm flex flex-col items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            {error}
          </div>
        ) : report ? (
          <ComprehensiveReportView report={report} />
        ) : null}
      </div>

      <footer className="max-w-5xl mx-auto px-6 pb-8 pt-2 text-center text-[10px] text-zinc-600">
        본 리포트는 진단평가 채점 결과를 바탕으로 자동 생성되었습니다.
      </footer>
    </div>
  );
}
