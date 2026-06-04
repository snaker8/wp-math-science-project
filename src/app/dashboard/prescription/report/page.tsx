'use client';

// ============================================================================
// 진단평가 세트(A/B/C) 개인 종합 리포트 — 스태프 페이지
//   상단 경량 선택기(세트 → 학생) + 학부모 링크 복사 + 종합 리포트(공유 컴포넌트).
//   표시는 ComprehensiveReportView (학부모 공개 페이지와 동일 컴포넌트).
//   (Phase 2: "학생 성적" 진입 허브가 이 선택기를 대체)
// ============================================================================

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, BarChart3, Layers, Users, Share2, Check } from 'lucide-react';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import { ComprehensiveReportView, type ComprehensiveReportPayload } from '@/components/diagnostics/ComprehensiveReportView';

interface SetStudent {
  id: string; name: string; grade: number | null;
  source: 'user' | 'roster'; variantsTaken: Array<'A' | 'B' | 'C' | null>;
}
interface ExamSetVariant { examId: string; variant: 'A' | 'B' | 'C' | null; title: string; }
interface ExamSetListItem {
  setKey: string; bookGroupId: string | null; bookGroupName: string | null;
  setTitle: string; variants: ExamSetVariant[]; gradedStudentCount: number; students: SetStudent[];
}

function ReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setKey = searchParams.get('setKey');
  const studentId = searchParams.get('studentId');

  const [sets, setSets] = useState<ExamSetListItem[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [setsError, setSetsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSetsLoading(true);
      try {
        const res = await fetch('/api/diagnostics/exam-sets', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setSets(data.sets || []);
      } catch (e) {
        if (!cancelled) setSetsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSetsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedSet = useMemo(() => sets.find((s) => s.setKey === setKey) ?? null, [sets, setKey]);

  const [report, setReport] = useState<ComprehensiveReportPayload | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!setKey || !studentId) { setReport(null); return; }
    let cancelled = false;
    setReportLoading(true); setReportError(null);
    (async () => {
      try {
        const url = `/api/diagnostics/comprehensive-report?studentId=${encodeURIComponent(studentId)}&setKey=${encodeURIComponent(setKey)}`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) setReportError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setKey, studentId]);

  const handleSelectSet = useCallback((key: string) => {
    router.push(`/dashboard/prescription/report?setKey=${encodeURIComponent(key)}`);
  }, [router]);
  const handleSelectStudent = useCallback((sid: string) => {
    if (!setKey) return;
    router.push(`/dashboard/prescription/report?setKey=${encodeURIComponent(setKey)}&studentId=${encodeURIComponent(sid)}`);
  }, [router, setKey]);

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <header className="border-b border-zinc-800/50 bg-gradient-to-r from-indigo-900/40 via-cyan-900/30 to-zinc-900/30 px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10">
            <BarChart3 className="h-6 w-6 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">진단평가 종합 리포트</h1>
              <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">시험대비 처방</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">A·B·C 진단 결과를 합산해 약점 단원과 시험 대비 방향을 분석합니다</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* 선택기 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-2"><Layers className="h-3.5 w-3.5" /> 진단평가 세트</label>
              {setsLoading ? (
                <div className="text-zinc-500 text-sm flex items-center gap-2 py-2"><Loader2 className="animate-spin" size={14} /> 세트 로딩 중…</div>
              ) : setsError ? (
                <div className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{setsError}</div>
              ) : (
                <select value={setKey ?? ''} onChange={(e) => handleSelectSet(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none">
                  <option value="" disabled>세트 선택…</option>
                  {sets.map((s) => (
                    <option key={s.setKey} value={s.setKey}>
                      {s.setTitle}{s.bookGroupName ? ` · ${s.bookGroupName}` : ''} — 변형 {s.variants.length}, 채점 {s.gradedStudentCount}명
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-2"><Users className="h-3.5 w-3.5" /> 학생</label>
              <select value={studentId ?? ''} onChange={(e) => handleSelectStudent(e.target.value)} disabled={!selectedSet}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none disabled:opacity-40">
                <option value="" disabled>{selectedSet ? '학생 선택…' : '세트 먼저 선택'}</option>
                {(selectedSet?.students ?? []).map((stu) => (
                  <option key={stu.id} value={stu.id}>
                    {stu.name}{stu.grade != null ? ` (${gradeIntToLabel(String(stu.grade), '-')})` : ''}
                    {' — '}{stu.variantsTaken.map((v) => v ?? '?').join('·')} ({stu.variantsTaken.length}개)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {!setKey || !studentId ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-12 text-center text-zinc-500 text-sm">
            세트와 학생을 선택하면 진단 → 시험대비 처방 리포트가 표시됩니다.
          </div>
        ) : reportLoading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-12 text-center text-zinc-500 flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={18} /> 리포트 생성 중…</div>
        ) : reportError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-8 text-center text-rose-300 text-sm">{reportError}</div>
        ) : report ? (
          <ComprehensiveReportView
            report={report}
            actionSlot={<ParentLinkBar studentId={report.student.id} setKey={report.set.setKey} />}
          />
        ) : null}
      </div>
    </div>
  );
}

// 학부모 링크 발급 + 복사
function ParentLinkBar({ studentId, setKey }: { studentId: string; setKey: string }) {
  const [issuing, setIssuing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const issueAndCopy = useCallback(async () => {
    setIssuing(true); setErr(null);
    try {
      const res = await fetch('/api/diagnostics/report/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, setKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setIssuedUrl(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // 클립보드 차단 시 URL 노출 (아래 표시)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setIssuing(false);
    }
  }, [studentId, setKey]);

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-emerald-200">
        <Share2 className="h-4 w-4 text-emerald-400" />
        <span className="font-semibold">학부모 공유 링크</span>
        <span className="text-[11px] text-emerald-300/70">로그인 없이 이 리포트를 볼 수 있는 링크를 발급합니다</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={issueAndCopy} disabled={issuing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50">
          {issuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          {issuing ? '발급 중…' : copied ? '복사됨!' : '학부모 링크 복사'}
        </button>
      </div>
      {err && <div className="w-full text-[11px] text-rose-300">{err}</div>}
      {issuedUrl && !copied && (
        <div className="w-full">
          <input readOnly value={issuedUrl} onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-300" />
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <Loader2 className="animate-spin mr-2" size={18} /> 리포트 로딩…
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
