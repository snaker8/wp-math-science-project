'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2, CheckCircle2, AlertCircle, ExternalLink, Printer, QrCode } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================
interface ExamOption {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  problem_count?: number;
}
interface StudentOption {
  id: string;
  name: string;
  grade: string;
  className: string;
}
type SessionType = 'BS' | 'DD' | 'PT' | 'SC';

interface CreateResult {
  created: Array<{ session_id: string; student_id: string; problem_count: number }>;
  skipped: Array<{ student_id: string; reason: string }>;
  exam: { id: string; title: string };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: StudentOption[];
  /** 기본 선택 학생 ID (prescription 페이지에서 현재 보고 있는 학생) */
  defaultStudentId?: string | null;
  onCreated?: (result: CreateResult) => void;
}

const SESSION_TYPES: Array<{ key: SessionType; label: string; desc: string }> = [
  { key: 'BS', label: 'BS 광역 스캔', desc: '1회차 · 전단원' },
  { key: 'DD', label: 'DD 정밀 진단', desc: '2회차 · 단원 집중' },
  { key: 'PT', label: 'PT 선수 추적', desc: '3회차 · 체인' },
  { key: 'SC', label: 'SC 스팟 체크', desc: '주기 점검' },
];

// ============================================================================
// Component
// ============================================================================
export default function CreateSessionsModal({
  isOpen, onClose, students, defaultStudentId, onCreated,
}: Props) {
  // ── Exam list ──
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examSearch, setExamSearch] = useState('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');

  // ── Session params ──
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [sessionType, setSessionType] = useState<SessionType>('BS');
  const [teacherNote, setTeacherNote] = useState<string>('');

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // default 학생 자동 체크
  useEffect(() => {
    if (!isOpen) return;
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (defaultStudentId) next.add(defaultStudentId);
      return next;
    });
  }, [isOpen, defaultStudentId]);

  // exam 목록 로드
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setExamsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/exams');
        const data = await res.json();
        if (!cancelled && Array.isArray(data.exams)) {
          setExams(data.exams.map((e: any) => ({
            id: e.id,
            title: e.title || '',
            subject: e.subject || null,
            grade: e.grade || null,
            problem_count: e.problem_count,
          })));
        }
      } catch (e) {
        if (!cancelled) console.error('[CreateSessionsModal] exams load error:', e);
      } finally {
        if (!cancelled) setExamsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const filteredExams = useMemo(() => {
    if (!examSearch.trim()) return exams;
    const q = examSearch.trim().toLowerCase();
    return exams.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.subject || '').toLowerCase().includes(q) ||
      (e.grade || '').toLowerCase().includes(q),
    );
  }, [exams, examSearch]);

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAllStudents = () => {
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map(s => s.id)));
    }
  };

  const canSubmit = !submitting && !!selectedExamId && selectedStudents.size > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id: selectedExamId,
          student_ids: Array.from(selectedStudents),
          round_number: roundNumber,
          session_type: sessionType,
          teacher_note: teacherNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data as CreateResult);
      onCreated?.(data as CreateResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setResult(null);
    setError(null);
    setExamSearch('');
    setSelectedExamId('');
    setTeacherNote('');
    setSelectedStudents(new Set());
    onClose();
  };

  if (!isOpen) return null;

  const studentById = new Map(students.map(s => [s.id, s]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-surface-base text-content-primary shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold">QR 채점 세션 일괄 생성</h2>
            <p className="text-xs text-content-tertiary mt-0.5">학생 × 시험지 × 회차 단위로 세션 생성</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {/* Result view */}
          {result && (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 size={16} />
                  {result.created.length}개 세션 생성 완료 ({result.skipped.length}개 건너뜀)
                </div>
                <div className="text-xs text-content-tertiary mt-1">{result.exam.title}</div>
              </div>

              {result.created.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-content-secondary">생성된 세션</div>
                  {result.created.map(c => {
                    const s = studentById.get(c.student_id);
                    return (
                      <div key={c.session_id} className="rounded-lg border border-white/10 bg-surface-raised px-3 py-2 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{s?.name || '(알 수 없음)'}</div>
                          <div className="text-[10px] text-content-tertiary">
                            {c.problem_count}문항 · session_id {c.session_id.slice(0, 8)}…
                          </div>
                        </div>
                        <a
                          href={`/print/session/${c.session_id}?variant=teacher`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
                          title="강사용 인쇄 페이지"
                        >
                          <Printer size={12} /> 강사
                        </a>
                        <a
                          href={`/print/session/${c.session_id}?variant=student`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
                          title="학생용 인쇄 페이지"
                        >
                          <Printer size={12} /> 학생
                        </a>
                        <a
                          href={`/answer/${c.session_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
                          title="학생 답 입력 페이지 (QR 진입 화면 미리보기)"
                        >
                          <QrCode size={12} /> 답입력
                        </a>
                        <a
                          href={`/grade/${c.session_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded border border-white/[.08] bg-white/[.04] text-content-secondary hover:bg-white/[.06] hover:text-content-primary flex items-center gap-1 whitespace-nowrap"
                          title="모바일 채점 페이지"
                        >
                          <ExternalLink size={12} /> 채점
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}

              {result.skipped.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-content-secondary">건너뜀</div>
                  {result.skipped.map((s, i) => {
                    const stu = studentById.get(s.student_id);
                    return (
                      <div key={i} className="text-xs text-amber-400 flex items-center gap-2 px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle size={12} className="flex-shrink-0" />
                        <span className="font-medium">{stu?.name || s.student_id.slice(0,8)}</span>
                        <span className="text-content-tertiary">— {s.reason}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Form view */}
          {!result && (
            <>
              {/* Exam picker */}
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-2">시험지 선택</label>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary" />
                  <input
                    value={examSearch}
                    onChange={(e) => setExamSearch(e.target.value)}
                    placeholder="시험지 제목·과목·학년 검색"
                    className="w-full pl-9 pr-3 py-2 bg-surface-card border border-white/10 rounded-lg text-sm focus:border-white/30 outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-surface-card divide-y divide-white/5">
                  {examsLoading ? (
                    <div className="p-6 text-center text-content-tertiary text-sm flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={14} /> 시험지 로딩…
                    </div>
                  ) : filteredExams.length === 0 ? (
                    <div className="p-6 text-center text-content-tertiary text-xs">
                      {examSearch ? '검색 결과 없음' : '시험지가 없습니다'}
                    </div>
                  ) : (
                    filteredExams.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedExamId(e.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          selectedExamId === e.id ? 'bg-white/[.08] text-content-primary' : 'text-content-secondary hover:bg-white/[.04]'
                        }`}
                      >
                        <div className="font-semibold truncate">{e.title}</div>
                        <div className="text-[10px] text-content-tertiary mt-0.5">
                          {e.subject || '-'} · {e.grade || '-'}
                          {e.problem_count != null ? ` · ${e.problem_count}문항` : ''}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Students */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-content-secondary">
                    학생 선택 <span className="text-content-tertiary">({selectedStudents.size}/{students.length})</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllStudents}
                    className="text-[11px] text-content-secondary hover:text-content-primary whitespace-nowrap"
                  >
                    {selectedStudents.size === students.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-surface-card grid grid-cols-2 md:grid-cols-3 gap-1 p-1">
                  {students.length === 0 ? (
                    <div className="col-span-full p-6 text-center text-content-tertiary text-xs">
                      학생이 없습니다.
                    </div>
                  ) : (
                    students.map(s => {
                      const checked = selectedStudents.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleStudent(s.id)}
                          className={`text-left px-2 py-1.5 rounded text-xs transition-colors ${
                            checked
                              ? 'bg-white/[.08] text-content-primary border border-white/[.14]'
                              : 'text-content-secondary hover:bg-white/[.04] border border-transparent'
                          }`}
                        >
                          <div className="font-semibold truncate">{s.name}</div>
                          <div className="text-[10px] text-content-tertiary">
                            {s.grade || '-'}{s.className ? ` · ${s.className}` : ''}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Round + Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-2">회차</label>
                  <div className="flex gap-1">
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRoundNumber(n)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                          roundNumber === n
                            ? 'bg-white/[.08] text-content-primary border-white/[.14]'
                            : 'border-white/10 text-content-secondary hover:bg-white/[.04]'
                        }`}
                      >
                        R{n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-2">세션 타입</label>
                  <div className="grid grid-cols-2 gap-1">
                    {SESSION_TYPES.map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setSessionType(t.key)}
                        className={`px-2 py-1.5 rounded-lg border text-xs text-left transition-colors ${
                          sessionType === t.key
                            ? 'bg-white/[.08] text-content-primary border-white/[.14]'
                            : 'border-white/10 text-content-secondary hover:bg-white/[.04]'
                        }`}
                      >
                        <div className="font-semibold">{t.label}</div>
                        <div className="text-[10px] text-content-tertiary">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-2">강사 메모 (선택)</label>
                <textarea
                  value={teacherNote}
                  onChange={(e) => setTeacherNote(e.target.value)}
                  rows={2}
                  placeholder="예: 중간고사 대비 BS 1회차"
                  className="w-full px-3 py-2 bg-surface-card border border-white/10 rounded-lg text-sm focus:border-white/30 outline-none resize-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3 flex-shrink-0 bg-surface-raised/40">
          {!result ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-4 py-2 rounded-full text-sm text-content-secondary hover:bg-white/[.06] hover:text-content-primary disabled:opacity-50 whitespace-nowrap"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-5 py-2 rounded-full text-sm font-semibold bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {submitting && <Loader2 className="animate-spin" size={14} />}
                {submitting ? '생성 중…' : `${selectedStudents.size}개 세션 생성`}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 rounded-full text-sm font-semibold bg-white text-black hover:bg-zinc-200 whitespace-nowrap"
            >
              완료
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
