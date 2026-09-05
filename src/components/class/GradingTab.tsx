'use client';

// ============================================================================
// 반 허브 ▸ 채점 — 이 반의 채점 회차를 반 안에서 (매쓰홀릭 학습 탭 + 채점 모달 대응)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 7 · 실측: 매쓰홀릭 학습 탭은 회차 카드(평균점수 · 전원 제출/N명 제출/미제출),
// 채점 모달은 **채점 끝난 자리에서 유형분석 → 취약 유형 → 과제 · 오답유사**(09 §5-3).
//
// 여기: 시험지(회차)별로 묶은 이 반의 QR 채점 세션 — 학생마다 미채점/완료·점수 · 채점표 업로드 · 삭제.
//   위에 [QR 채점 세션 만들기](반 학생만 미리 골라 둠) · [오답 과제] · [취약 과제] · 수동 입력 링크.
//   채점이 끝나면 그 자리에서 과제로 이어진다 — 옛 「채점하기」 메뉴를 떠나지 않는다.
// ★ 채점 세션 생성·채점표 업로드는 기존 컴포넌트(CreateSessionsModal · GradingSheetUpload)를 그대로 쓴다.
//   채점 라인은 B 하나 — 여기서 새 저장 경로를 만들지 않는다.
// ★ 세션 삭제는 묻지 않는다 — 대표 지시(채점 화면): "묻지 말고 내가 삭제 가능하게 해라".
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, AlertCircle, QrCode, Upload, Trash2, ChevronDown, ChevronRight, Sparkles, RotateCcw, ExternalLink, Grid3x3,
} from 'lucide-react';
import CreateSessionsModal from '@/components/prescription/CreateSessionsModal';
import GradingSheetUpload from '@/components/grading/GradingSheetUpload';
import { GenerateAssignmentModal, type GenKind } from './GenerateAssignmentModal';
import type { ClassSession } from '@/app/api/classes/[classId]/sessions/route';

interface Props {
  classId: string;
  className: string;
  students: Array<{ id: string; name: string; grade: string }>;
  onOpenMastery: () => void;
}

function pctTone(pct: number | null): string {
  if (pct == null) return 'text-content-tertiary';
  if (pct >= 80) return 'text-emerald-400';
  if (pct < 60) return 'text-red-400';
  return 'text-content-primary';
}
function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—';
}

interface ExamGroup {
  key: string;
  examId: string | null;
  title: string;
  round: number | null;
  sessions: ClassSession[];
  done: number;
  avgPct: number | null;
  latest: string;
}

export function GradingTab({ classId, className, students, onOpenMastery }: Props) {
  const [rows, setRows] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [upload, setUpload] = useState<ClassSession | null>(null);
  const [gen, setGen] = useState<GenKind | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/sessions`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((data.sessions || []) as ClassSession[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo<ExamGroup[]>(() => {
    const m = new Map<string, ExamGroup>();
    for (const s of rows) {
      if (filter !== 'all' && s.status !== filter) continue;
      const key = `${s.examId ?? 'none'}|${s.round ?? ''}`;
      const g = m.get(key) ?? { key, examId: s.examId, title: s.examTitle, round: s.round, sessions: [], done: 0, avgPct: null, latest: '' };
      g.sessions.push(s);
      if (s.status === 'done') g.done += 1;
      const when = s.completedAt ?? s.issuedAt ?? '';
      if (when > g.latest) g.latest = when;
      m.set(key, g);
    }
    const out = Array.from(m.values());
    for (const g of out) {
      const pcts = g.sessions.map((s) => s.pct).filter((p): p is number => p != null);
      g.avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
      g.sessions.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));
    }
    out.sort((a, b) => (b.latest > a.latest ? 1 : b.latest < a.latest ? -1 : 0));
    return out;
  }, [rows, filter]);

  // 처음엔 최근 3개만 펼쳐 둔다
  useEffect(() => {
    if (groups.length > 0 && open.size === 0) setOpen(new Set(groups.slice(0, 3).map((g) => g.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    done: rows.filter((r) => r.status === 'done').length,
  }), [rows]);

  const remove = async (s: ClassSession) => {
    if (deleting) return;
    setDeleting(s.id);
    try {
      const res = await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      setRows((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  };

  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const studentIds = students.map((s) => s.id);

  return (
    <div>
      {/* 머리 — 통계 + 행동 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-sm">
          {([['all', '전체', stats.total], ['pending', '미채점', stats.pending], ['done', '완료', stats.done]] as const).map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-md px-2.5 py-1 tabular-nums transition-colors ${
                filter === k ? 'bg-white text-black' : 'text-content-secondary hover:bg-white/5 hover:text-content-primary'
              }`}
            >
              {label} <span className={filter === k ? 'text-black/60' : 'text-content-muted'}>{n}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/grading?tab=manual"
            className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary"
            title="문제 없이 유형만 기록하는 수동 입력"
          >
            수동 입력 <ExternalLink className="h-3 w-3" />
          </Link>
          <button
            onClick={() => setGen('wrong')}
            disabled={stats.done === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40"
            title="채점된 오답으로 바로 과제"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            오답 과제
          </button>
          <button
            onClick={() => setGen('weak')}
            disabled={stats.done === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40"
            title="채점으로 잡힌 약한 유형에서 새 문제로 과제"
          >
            <Sparkles className="h-3.5 w-3.5" />
            취약 과제
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={students.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <QrCode className="h-3.5 w-3.5" />
            QR 채점 세션 만들기
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          채점 세션을 불러오는 중
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-6 py-14 text-center">
          <p className="text-sm text-content-secondary">
            {rows.length === 0 ? '이 반에 채점 세션이 없습니다.' : '조건에 맞는 세션이 없습니다.'}
          </p>
          <p className="mt-1 text-xs text-content-muted">
            「QR 채점 세션 만들기」로 시험지를 고르고 학생을 지정하면, 채점표를 찍어 올리는 것으로 채점이 끝납니다.
            채점이 쌓이면 숙달·이력 탭이 그걸로 그려집니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const on = open.has(g.key);
            return (
              <div key={g.key} className="rounded-xl border border-white/10">
                <button
                  onClick={() => toggle(g.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[.02]"
                >
                  {on ? <ChevronDown className="h-4 w-4 shrink-0 text-content-tertiary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content-primary">
                      {g.title}{g.round != null && <span className="ml-1.5 text-xs text-content-tertiary">{g.round}회차</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-content-tertiary">{fmtDate(g.latest)}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    <span className={`block font-medium ${g.done === g.sessions.length ? 'text-content-primary' : g.done === 0 ? 'text-content-tertiary' : 'text-content-secondary'}`}>
                      {g.done === g.sessions.length ? '전원 채점' : g.done === 0 ? '미채점' : `${g.done}/${g.sessions.length}명 채점`}
                    </span>
                    <span className={`block ${pctTone(g.avgPct)}`}>{g.avgPct == null ? '—' : `평균 ${g.avgPct}%`}</span>
                  </span>
                </button>

                {on && (
                  <div className="border-t border-white/5">
                    <table className="w-full text-sm">
                      <tbody>
                        {g.sessions.map((s) => (
                          <tr key={s.id} className="border-b border-white/5 last:border-0">
                            <td className="px-4 py-2 pl-11 text-content-primary">{s.studentName}</td>
                            <td className="px-3 py-2 text-xs text-content-tertiary">
                              {s.status === 'done' ? `채점 ${fmtDate(s.completedAt)}` : `배포 ${fmtDate(s.issuedAt)}`}
                            </td>
                            <td className={`px-3 py-2 text-right text-sm font-medium tabular-nums ${pctTone(s.pct)}`}>
                              {s.pct == null ? <span className="text-content-muted">미채점</span> : `${s.pct}%`}
                            </td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums text-content-muted">
                              {s.graded}/{s.total}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => setUpload(s)}
                                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary"
                                  title={s.status === 'done' ? '채점표를 다시 올려 덮어쓰기' : '채점표 사진을 올려 자동 채점'}
                                >
                                  <Upload className="h-3 w-3" />
                                  {s.status === 'done' ? '다시 채점' : '채점표 업로드'}
                                </button>
                                <button
                                  onClick={() => void remove(s)}
                                  disabled={deleting === s.id}
                                  className="rounded-md p-1 text-content-muted transition-colors hover:text-red-400 disabled:opacity-40"
                                  title="세션 삭제 (묻지 않음)"
                                >
                                  {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {g.done > 0 && (
                      <div className="flex items-center justify-end gap-2 border-t border-white/5 px-4 py-2">
                        <span className="mr-auto text-xs text-content-muted">채점 끝난 자리에서 바로 —</span>
                        <button onClick={onOpenMastery} className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary">
                          <Grid3x3 className="h-3 w-3" /> 유형분석 보기
                        </button>
                        <button onClick={() => setGen('wrong')} className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary">
                          <RotateCcw className="h-3 w-3" /> 오답 과제
                        </button>
                        <button onClick={() => setGen('weak')} className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary">
                          <Sparkles className="h-3 w-3" /> 취약 과제
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateSessionsModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        students={students.map((s) => ({ id: s.id, name: s.name, grade: s.grade, className }))}
        onCreated={() => { void load(); }}
      />

      {upload && (
        <GradingSheetUpload
          sessionId={upload.id}
          studentName={upload.studentName}
          examTitle={upload.examTitle}
          onClose={() => setUpload(null)}
          onSaved={() => { setUpload(null); void load(); }}
        />
      )}

      {gen && (
        <GenerateAssignmentModal
          classId={classId}
          studentIds={studentIds}
          kind={gen}
          className={className}
          onClose={() => setGen(null)}
          onDone={() => setGen(null)}
        />
      )}
    </div>
  );
}
