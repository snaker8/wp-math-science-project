'use client';

// ============================================================================
// 시험지/학습지 출제(배포) 모달 — 매쓰플랫 "학습지 출제하기" 미러링
//   시험지 고정 + 학년/반 토글 + 학생 그룹 트리(+/-) + 선택 패널 → POST /api/sessions
//   session_type='EX'(시험지). 진단(BS/DD/PT/SC)과 별개 출제 공통 라인(Phase 1).
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Search, Loader2, CheckCircle2, AlertCircle, Plus, Minus,
  ChevronRight, ChevronDown, Send, ExternalLink, Printer, QrCode,
} from 'lucide-react';
import { gradeIntToLabel } from '@/lib/students/grade-label';

interface StudentOption { id: string; name: string; grade: string; className: string; institute?: string; instituteId?: string | null; }
interface InstituteOption { id: string; name: string; }

export interface DeployResult {
  created: Array<{ session_id: string; student_id: string; problem_count: number }>;
  skipped: Array<{ student_id: string; reason: string }>;
  exam: { id: string; title: string };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 고정 출제 대상 시험지 */
  exam: { id: string; title: string } | null;
  onDeployed?: (result: DeployResult) => void;
}

const GRADE_ORDER = ['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'];
const gradeRank = (g: string) => {
  const i = GRADE_ORDER.indexOf(g);
  return i < 0 ? 99 : i;
};

export default function DeployExamModal({ isOpen, onClose, exam, onDeployed }: Props) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<'grade' | 'class'>('grade');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openL, setOpenL] = useState<Set<string>>(new Set());
  const [openR, setOpenR] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 학원(institute) 구분/선택 — super_admin·다중학원에서만 노출
  const [institutes, setInstitutes] = useState<InstituteOption[]>([]);
  const [selectedInstitute, setSelectedInstitute] = useState<string>(''); // '' = 전체

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (!isOpen) return;
    setResult(null); setError(null); setSelected(new Set()); setSearch('');
    setSelectedInstitute('');
  }, [isOpen]);

  // 학생 로드 (모달 열릴 때 + 학원 선택 변경 시)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    const qs = selectedInstitute ? `?institute_id=${encodeURIComponent(selectedInstitute)}` : '';
    fetch(`/api/users/students${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.students)) setStudents(d.students as StudentOption[]);
        if (Array.isArray(d.institutes)) setInstitutes(d.institutes as InstituteOption[]);
      })
      .catch(() => { if (!cancelled) setError('학생 목록을 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, selectedInstitute]);

  const keyOf = (s: StudentOption) => (groupBy === 'grade' ? (s.grade || '미배정') : (s.className || '미배정'));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students;
  }, [students, search]);

  const groupOf = (list: StudentOption[]): Array<[string, StudentOption[]]> => {
    const m = new Map<string, StudentOption[]>();
    for (const s of list) {
      const k = keyOf(s);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return [...m.entries()]
      .sort((a, b) => (groupBy === 'grade' ? gradeRank(a[0]) - gradeRank(b[0]) : a[0].localeCompare(b[0], 'ko')))
      .map(([k, v]) => [k, v.sort((x, y) => x.name.localeCompare(y.name, 'ko'))] as [string, StudentOption[]]);
  };

  const availGroups = useMemo(
    () => groupOf(filtered.filter((s) => !selected.has(s.id))),
    [filtered, selected, groupBy], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selGroups = useMemo(
    () => groupOf(students.filter((s) => selected.has(s.id))),
    [students, selected, groupBy], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const addMany = (ids: string[]) => setSelected((p) => { const n = new Set(p); ids.forEach((i) => n.add(i)); return n; });
  const removeMany = (ids: string[]) => setSelected((p) => { const n = new Set(p); ids.forEach((i) => n.delete(i)); return n; });
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) =>
    set((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const handleDeploy = async () => {
    if (!exam || selected.size === 0 || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.id, student_ids: [...selected], session_type: 'EX', round_number: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '출제 실패');
      setResult(data as DeployResult);
      onDeployed?.(data as DeployResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '출제 실패');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;
  const studentById = new Map(students.map((s) => [s.id, s]));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-lg font-bold text-white">시험지 출제하기</h2>
            <span className="text-sm text-zinc-400 truncate">{exam?.title || ''}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          /* ── 결과 ── */
          <div className="p-5 overflow-y-auto">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-bold">{result.created.length}명 출제 완료</span>
                {result.skipped.length > 0 && (
                  <span className="text-amber-400 text-sm">· {result.skipped.length}명 건너뜀</span>
                )}
              </div>
              {result.created.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const ids = result.created.map((c) => c.session_id);
                    if (ids.length === 0) return;
                    // ★ 학생마다 새 탭(팝업 차단으로 1명만 열림) 대신 한 탭에 전원 묶음
                    //   → Ctrl+P 한 번에 전체 학생지 PDF (학생마다 페이지 나뉨).
                    window.open(`/print/session/${ids[0]}?variant=student&ids=${ids.join(',')}`, '_blank');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-600/50 text-cyan-300 hover:bg-cyan-600/15 text-xs font-semibold"
                  title="출제된 전체 학생지를 한 탭에 묶어서 — Ctrl+P 한 번에 전체 PDF"
                >
                  <Printer className="h-3.5 w-3.5" /> 전체 학생지 PDF
                </button>
              )}
            </div>
            <div className="space-y-1.5 mb-4">
              {result.created.map((c) => {
                const s = studentById.get(c.student_id);
                return (
                  <div key={c.session_id} className="flex items-center justify-between rounded-lg bg-zinc-800/60 px-3 py-2 text-sm">
                    <span className="text-white font-medium">{s?.name || c.student_id.slice(0, 8)}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-500">{c.problem_count}문항</span>
                      <a href={`/print/session/${c.session_id}?variant=student`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
                        <Printer className="h-3.5 w-3.5" />출력
                      </a>
                      <a href={`/grade/${c.session_id}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-zinc-300 hover:text-white">
                        <ExternalLink className="h-3.5 w-3.5" />채점
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
            {result.skipped.length > 0 && (
              <div className="space-y-1 mb-4">
                {result.skipped.map((s, i) => {
                  const stu = studentById.get(s.student_id);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs text-amber-400/90">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="font-medium">{stu?.name || s.student_id.slice(0, 8)}</span>
                      <span className="text-zinc-500">{s.reason}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setResult(null); setSelected(new Set()); }}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium">
                계속 출제
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold">
                닫기
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 학원 선택 (super_admin·다중학원만) — 고르면 그 학원 학생만 */}
            {institutes.length > 0 && (
              <div className="px-5 pt-4">
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">학원</label>
                <select
                  value={selectedInstitute}
                  onChange={(e) => { setSelectedInstitute(e.target.value); setSelected(new Set()); setOpenL(new Set()); setOpenR(new Set()); }}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-zinc-800 text-sm text-white border border-zinc-700 outline-none focus:border-cyan-600"
                >
                  <option value="">전체 학원</option>
                  {institutes.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 학년/반 토글 */}
            <div className="px-5 pt-4">
              <div className="flex rounded-lg bg-zinc-800 p-1">
                {(['grade', 'class'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => { setGroupBy(g); setOpenL(new Set()); setOpenR(new Set()); }}
                    className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                      groupBy === g ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}>
                    {g === 'grade' ? '학년' : '반'}
                  </button>
                ))}
              </div>
            </div>

            {/* 2-패널 */}
            <div className="flex-1 grid grid-cols-2 gap-3 px-5 py-3 min-h-0">
              {/* 좌: 추가 가능 */}
              <div className="flex flex-col min-h-0 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="p-2 border-b border-zinc-800">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="학생 이름 검색"
                      className="w-full pl-8 pr-7 py-1.5 rounded-md bg-zinc-800 text-sm text-white placeholder-zinc-500 outline-none border border-transparent focus:border-zinc-600" />
                    {search && (
                      <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center h-full text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : availGroups.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-600 text-sm">학생 없음</div>
                  ) : availGroups.map(([g, list]) => (
                    <div key={g} className="border-b border-zinc-800/60">
                      <div className="flex items-center px-2.5 py-2 hover:bg-zinc-800/40">
                        <button type="button" onClick={() => toggle(setOpenL, g)} className="text-zinc-500 hover:text-zinc-300">
                          {openL.has(g) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <span className="ml-1 font-semibold text-white text-sm">{g}</span>
                        <span className="ml-2 text-xs text-zinc-500">{list.length}명</span>
                        <button type="button" onClick={() => addMany(list.map((s) => s.id))}
                          className="ml-auto p-1 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white" title="전체 추가">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openL.has(g) && list.map((s) => (
                        <div key={s.id} className="flex items-center pl-8 pr-2.5 py-1.5 hover:bg-zinc-800/40">
                          <span className="text-sm text-zinc-300">{s.name}</span>
                          {gradeIntToLabel(s.grade) && <span className="ml-2 text-[11px] font-medium text-zinc-400 px-1 py-0.5 rounded bg-zinc-700/60">{gradeIntToLabel(s.grade)}</span>}
                          {s.className && <span className="ml-2 text-[11px] text-zinc-600">{s.className}</span>}
                          {/* 학원 라벨 — '어디 학생인지' 구분 (전체 보기 시) */}
                          {!selectedInstitute && s.institute && (
                            <span className="ml-2 text-[10px] font-medium text-cyan-400/80 px-1 py-0.5 rounded bg-cyan-500/10">{s.institute}</span>
                          )}
                          <button type="button" onClick={() => addMany([s.id])}
                            className="ml-auto p-0.5 rounded-full bg-cyan-600/80 hover:bg-cyan-500 text-white">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* 우: 선택됨 */}
              <div className="flex flex-col min-h-0 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-zinc-800 text-sm">
                  <span className="font-semibold text-white">선택된 학생</span>
                  <span className="ml-2 text-cyan-400 font-bold">{selected.size > 0 ? `${selected.size}명` : '없음'}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {selected.size === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-sm gap-1 px-4 text-center">
                      <Plus className="h-5 w-5" />
                      왼쪽의 + 를 눌러 학생을 선택해 주세요.
                    </div>
                  ) : selGroups.map(([g, list]) => (
                    <div key={g} className="border-b border-zinc-800/60">
                      <div className="flex items-center px-2.5 py-2 hover:bg-zinc-800/40">
                        <button type="button" onClick={() => toggle(setOpenR, g)} className="text-zinc-500 hover:text-zinc-300">
                          {openR.has(g) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <span className="ml-1 font-semibold text-white text-sm">{g}</span>
                        <span className="ml-2 text-xs text-zinc-500">{list.length}명</span>
                        <button type="button" onClick={() => removeMany(list.map((s) => s.id))}
                          className="ml-auto p-1 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white" title="전체 제거">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openR.has(g) && list.map((s) => (
                        <div key={s.id} className="flex items-center pl-8 pr-2.5 py-1.5 hover:bg-zinc-800/40">
                          <span className="text-sm text-zinc-300">{s.name}</span>
                          {gradeIntToLabel(s.grade) && <span className="ml-2 text-[11px] font-medium text-zinc-400 px-1 py-0.5 rounded bg-zinc-700/60">{gradeIntToLabel(s.grade)}</span>}
                          {!selectedInstitute && s.institute && (
                            <span className="ml-2 text-[10px] font-medium text-cyan-400/80 px-1 py-0.5 rounded bg-cyan-500/10">{s.institute}</span>
                          )}
                          <button type="button" onClick={() => removeMany([s.id])}
                            className="ml-auto p-0.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white">
                            <Minus className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-5 mb-2 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-sm text-rose-400">
                <AlertCircle className="h-4 w-4" />{error}
              </div>
            )}

            {/* 하단: 출제 */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-zinc-800">
              <span className="text-xs text-zinc-500 inline-flex items-center gap-1">
                <QrCode className="h-3.5 w-3.5" /> 출제 후 학생별 QR·출력·채점 가능
              </span>
              <button type="button" onClick={handleDeploy} disabled={selected.size === 0 || submitting || !exam}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-bold transition-colors">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? '출제 중…' : `${selected.size > 0 ? selected.size + '명에게 ' : ''}출제하기`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
