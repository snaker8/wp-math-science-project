'use client';

// ============================================================================
// 진단평가 세트(A/B/C) 개인 종합 리포트 — 스태프 페이지
//   상단 경량 선택기(세트 → 학생) + 학부모 링크 복사 + 종합 리포트(공유 컴포넌트).
//   표시는 ComprehensiveReportView (학부모 공개 페이지와 동일 컴포넌트).
//   (Phase 2: "학생 성적" 진입 허브가 이 선택기를 대체)
// ============================================================================

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, BarChart3, Layers, Users, Share2, Check, Search, Wand2 } from 'lucide-react';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import { useExamList } from '@/hooks/useExamProblems';
import { ComprehensiveReportView, type ComprehensiveReportPayload } from '@/components/diagnostics/ComprehensiveReportView';

interface SetStudent {
  id: string; name: string; grade: number | null;
  source: 'user' | 'roster'; variantsTaken: Array<string | null>;
}
interface ExamSetVariant { examId: string; variant: string | null; title: string; }
interface ExamSetListItem {
  setKey: string; bookGroupId: string | null; bookGroupName: string | null;
  setTitle: string; variants: ExamSetVariant[]; gradedStudentCount: number; students: SetStudent[];
}

function ReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setKey = searchParams.get('setKey');
  const studentId = searchParams.get('studentId');
  const examIdsParam = searchParams.get('examIds'); // 자유 조합(③) — 콤마구분 시험지 id

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

  // ── 자유 조합(③) 선택기 — 임의 시험지 여러 개 + 학생 → 합산 리포트 ──
  const [selTab, setSelTab] = useState<'set' | 'free'>(examIdsParam ? 'free' : 'set');
  const { exams: examList } = useExamList();
  const [freeStudents, setFreeStudents] = useState<Array<{ id: string; name: string; grade: string }>>([]);
  const [freeStudentId, setFreeStudentId] = useState('');
  const [freeExamIds, setFreeExamIds] = useState<Set<string>>(new Set());
  const [examSearch, setExamSearch] = useState('');
  useEffect(() => {
    fetch('/api/users/students').then((r) => r.json()).then((d) => {
      if (Array.isArray(d.students)) {
        setFreeStudents(d.students.map((s: { id: string; name: string; grade?: string }) => ({
          id: s.id, name: s.name, grade: s.grade || '',
        })));
      }
    }).catch(() => {});
  }, []);
  const freeFilteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return q ? examList.filter((e) => (e.title || '').toLowerCase().includes(q)) : examList;
  }, [examList, examSearch]);
  const toggleFreeExam = useCallback((id: string) => {
    setFreeExamIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const generateFreeReport = useCallback(() => {
    if (!freeStudentId || freeExamIds.size === 0) return;
    router.push(`/dashboard/prescription/report?examIds=${encodeURIComponent([...freeExamIds].join(','))}&studentId=${encodeURIComponent(freeStudentId)}`);
  }, [router, freeStudentId, freeExamIds]);

  useEffect(() => {
    const hasFree = !!examIdsParam;
    if ((!setKey && !hasFree) || !studentId) { setReport(null); return; }
    let cancelled = false;
    setReportLoading(true); setReportError(null);
    (async () => {
      try {
        const qs = hasFree
          ? `studentId=${encodeURIComponent(studentId)}&examIds=${encodeURIComponent(examIdsParam!)}`
          : `studentId=${encodeURIComponent(studentId)}&setKey=${encodeURIComponent(setKey!)}`;
        const res = await fetch(`/api/diagnostics/comprehensive-report?${qs}`, { cache: 'no-store' });
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
  }, [setKey, studentId, examIdsParam]);

  const handleSelectSet = useCallback((key: string) => {
    router.push(`/dashboard/prescription/report?setKey=${encodeURIComponent(key)}`);
  }, [router]);
  const handleSelectStudent = useCallback((sid: string) => {
    if (!setKey) return;
    router.push(`/dashboard/prescription/report?setKey=${encodeURIComponent(setKey)}&studentId=${encodeURIComponent(sid)}`);
  }, [router, setKey]);

  return (
    <div className="min-h-screen bg-surface-base text-content-primary font-sans">
      <header className="border-b border-white/[.08] bg-white/[.03] px-4 sm:px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.04]">
            <BarChart3 className="h-6 w-6 text-zinc-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">진단평가 종합 리포트</h1>
              <span className="rounded-md border border-white/[.08] bg-white/[.04] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300 whitespace-nowrap">시험대비 처방</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">A·B·C 진단 결과를 합산해 약점 단원과 시험 대비 방향을 분석합니다</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* 선택기 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {/* 모드 탭 — 진단평가 세트 / 자유 조합 */}
          <div className="flex gap-1 mb-4 border-b border-zinc-800">
            {([['set', '진단평가 세트'], ['free', '자유 조합']] as const).map(([t, label]) => (
              <button key={t} type="button" onClick={() => setSelTab(t)}
                className={`px-3 py-1.5 text-sm font-semibold border-b-2 -mb-px transition ${
                  selTab === t ? 'border-white/60 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {selTab === 'set' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-2"><Layers className="h-3.5 w-3.5" /> 진단평가 세트</label>
              {setsLoading ? (
                <div className="text-zinc-500 text-sm flex items-center gap-2 py-2"><Loader2 className="animate-spin" size={14} /> 세트 로딩 중…</div>
              ) : setsError ? (
                <div className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{setsError}</div>
              ) : (
                <select value={setKey ?? ''} onChange={(e) => handleSelectSet(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none">
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
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none disabled:opacity-40">
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
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-2"><Users className="h-3.5 w-3.5" /> 학생</label>
                <select value={freeStudentId} onChange={(e) => setFreeStudentId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none">
                  <option value="">학생 선택…</option>
                  {freeStudents.map((s) => <option key={s.id} value={s.id}>{s.name}{gradeIntToLabel(s.grade) ? ` (${gradeIntToLabel(s.grade)})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-2"><Layers className="h-3.5 w-3.5" /> 시험지 (여러 개 선택)</label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                  <input value={examSearch} onChange={(e) => setExamSearch(e.target.value)} placeholder="시험지명 검색"
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-white focus:border-white/30 focus:outline-none" />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
                  {freeFilteredExams.length === 0 ? (
                    <div className="text-center text-zinc-600 text-xs py-6">시험지가 없습니다.</div>
                  ) : freeFilteredExams.map((ex) => (
                    <label key={ex.id} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={freeExamIds.has(ex.id)} onChange={() => toggleFreeExam(ex.id)} className="accent-white" />
                      <span className="truncate">{ex.title}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button type="button" onClick={generateFreeReport} disabled={!freeStudentId || freeExamIds.size === 0}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:bg-white/[.06] disabled:text-zinc-500">
                <Wand2 className="h-4 w-4" /> 리포트 생성 ({freeExamIds.size}개 선택)
              </button>
            </div>
          )}
        </div>

        {((!setKey && !examIdsParam) || !studentId) ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-12 text-center text-zinc-500 text-sm">
            세트(또는 자유 조합)와 학생을 선택하면 진단 → 시험대비 처방 리포트가 표시됩니다.
          </div>
        ) : reportLoading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-12 text-center text-zinc-500 flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={18} /> 리포트 생성 중…</div>
        ) : reportError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-8 text-center text-rose-300 text-sm">{reportError}</div>
        ) : report ? (
          <ComprehensiveReportView
            report={report}
            showStaffActions
            actionSlot={<ParentLinkBar studentId={report.student.id} setKey={report.set.setKey} examIds={examIdsParam ? examIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined} />}
          />
        ) : null}
      </div>
    </div>
  );
}

// 학부모 링크 발급 + 복사
function ParentLinkBar({ studentId, setKey, examIds }: { studentId: string; setKey: string; examIds?: string[] }) {
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
        // ★ 자유 조합이면 examIds 동봉 — 공유 토큰이 그 조합으로 재계산되도록(set_key 만으론 못 찾음).
        body: JSON.stringify({ studentId, setKey, examIds: examIds && examIds.length > 0 ? examIds : undefined }),
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
  }, [studentId, setKey, examIds]);

  return (
    <div className="rounded-xl border border-white/[.08] bg-white/[.03] p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-zinc-200">
        <Share2 className="h-4 w-4 text-zinc-400" />
        <span className="font-semibold">학부모 공유 링크</span>
        <span className="text-[11px] text-zinc-500">로그인 없이 이 리포트를 볼 수 있는 링크를 발급합니다</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={issueAndCopy} disabled={issuing}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[.06] hover:text-white disabled:opacity-50">
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
      <div className="flex h-screen items-center justify-center bg-surface-base text-content-primary">
        <Loader2 className="animate-spin mr-2" size={18} /> 리포트 로딩…
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
