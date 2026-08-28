'use client';

// ============================================================================
// StudentLearningReport — 학생 1명 학습 보고서 (공용)
//   출제 관리(보고서 탭)와 수업 허브(/dashboard/class)가 공유.
//   구성: 헤더(평균·완료·리포트 도구 링크) → 진단 세트 리포트 딥링크 카드
//        → 점수 추이 → 보완 필요 → 전체 출제(개별 리포트 링크) → 학부모 공유링크 내역.
//   데이터: rows 는 부모가 전달(/api/assignments 필터), 세트/토큰은 내부 fetch.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink, History, PieChart, FileBarChart, TrendingUp,
  Layers, Share2, Copy, Check, Ban, Loader2,
} from 'lucide-react';

// /api/assignments 행 (보고서에 필요한 필드만 — 출제 관리 Assignment 와 구조 호환)
export interface LearningRow {
  id: string;
  source: 'qr' | 'manual';
  student_id: string;
  exam_id: string | null;
  title: string;
  tag: string;
  issued_at: string | null;
  completed: boolean;
  score_pct: number | null;
}

// 진단 세트 (exam-sets API) — "세트 리포트 보기" 딥링크용
interface ExamSetLite {
  setKey: string; setTitle: string; bookGroupName: string | null;
  variants: Array<{ examId: string; variant: string | null; title: string }>;
  students: Array<{ id: string; variantsTaken: Array<string | null> }>;
}
// 학부모 공유링크 발급 내역 (report-tokens API)
interface ShareTokenItem {
  kind: 'diagnostic_set' | 'pitfall' | 'exam';
  path: string; title: string; label: string | null;
  createdAt: string | null; expiresAt: string | null;
  isActive: boolean; lastViewedAt: string | null;
  revokeKind: 'parent_token' | 'exam_session'; revokeRef: string;
}
const TOKEN_KIND_LABEL: Record<ShareTokenItem['kind'], string> = {
  diagnostic_set: '세트 리포트', pitfall: '함정 리포트', exam: '시험 리포트',
};

// 태그(시험지/학습지/기타)는 카테고리 라벨 — 구분은 텍스트가 담당(무채)
const TAG_COLOR = (_tag: string): string => 'text-content-secondary';

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch { return iso; }
}

const tone = (p: number) => p >= 80 ? 'text-emerald-300' : p >= 60 ? 'text-amber-300' : 'text-rose-300';
const bar = (p: number) => p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-rose-500';

export function StudentLearningReport({
  student,
  rows,
}: {
  student: { id: string; name: string; grade?: string; className?: string };
  /** 이 학생의 출제 행 — issued_at 오름차순 정렬 상태로 전달 */
  rows: LearningRow[];
}) {
  const studentId = student.id;

  // ── 진단 세트 (1회 로드, 학생 무관 공용) + 공유링크 내역 (학생별) ──
  const [examSets, setExamSets] = useState<ExamSetLite[] | null>(null);
  const [shareTokens, setShareTokens] = useState<ShareTokenItem[] | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  useEffect(() => {
    if (examSets !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/diagnostics/exam-sets', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setExamSets(res.ok ? (data.sets || []) : []);
      } catch { if (!cancelled) setExamSets([]); }
    })();
    return () => { cancelled = true; };
  }, [examSets]);

  const loadShareTokens = async (sid: string) => {
    setTokensLoading(true);
    try {
      const res = await fetch(`/api/diagnostics/report-tokens?studentId=${encodeURIComponent(sid)}`, { cache: 'no-store' });
      const data = await res.json();
      setShareTokens(res.ok ? (data.tokens || []) : []);
    } catch { setShareTokens([]); } finally { setTokensLoading(false); }
  };
  useEffect(() => {
    setShareTokens(null);
    void loadShareTokens(studentId);
  }, [studentId]);

  const copyShareUrl = async (item: ShareTokenItem) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${item.path}`);
      setCopiedRef(item.revokeRef);
      setTimeout(() => setCopiedRef(null), 1500);
    } catch { /* clipboard 거부 — 무시 */ }
  };
  const revokeToken = async (item: ShareTokenItem) => {
    if (!window.confirm('이 공유링크를 회수할까요? 학부모가 더 이상 열 수 없게 됩니다.')) return;
    try {
      const res = await fetch('/api/diagnostics/report-tokens', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.revokeKind, ref: item.revokeRef }),
      });
      if (res.ok) void loadShareTokens(studentId);
    } catch { /* 실패 시 목록 유지 */ }
  };

  // 선택 학생이 응시한 진단 세트
  const studentSets = useMemo(() => {
    if (!examSets) return [];
    return examSets
      .map(s => ({ set: s, me: s.students.find(st => st.id === studentId) }))
      .filter((x): x is { set: ExamSetLite; me: { id: string; variantsTaken: Array<string | null> } } => !!x.me);
  }, [examSets, studentId]);

  const scored = rows.filter(r => r.score_pct != null);
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + (r.score_pct || 0), 0) / scored.length) : null;
  const doneN = rows.filter(r => r.completed).length;
  // 약점 = 점수 낮은 순 상위 5 (60점 미만 우선)
  const weak = [...scored].sort((a, b) => (a.score_pct || 0) - (b.score_pct || 0)).slice(0, 5);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 헤더 카드 */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xl font-bold">{student.name} 학습 보고서</div>
            <div className="text-xs text-content-tertiary mt-0.5">
              {student.grade || ''}{student.className ? ` · ${student.className}` : ''} · 출제 {rows.length}건
            </div>
          </div>
          <div className="flex gap-3 text-center">
            <div>
              <div className={`text-2xl font-bold tabular-nums ${avg != null ? tone(avg) : 'text-content-tertiary'}`}>{avg != null ? `${avg}점` : '-'}</div>
              <div className="text-[10px] text-content-tertiary uppercase tracking-wide">평균</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-content-secondary">{doneN}/{rows.length}</div>
              <div className="text-[10px] text-content-tertiary uppercase tracking-wide">완료</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Link href={`/dashboard/prescription/report?studentId=${studentId}`} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5">
            <FileBarChart size={13} /> 리포트 생성 도구 <ExternalLink size={10} className="opacity-50" />
          </Link>
          <Link href={`/tutor/analytics?studentId=${studentId}`} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5">
            <PieChart size={13} /> 단원 히트맵 <ExternalLink size={10} className="opacity-50" />
          </Link>
        </div>
      </div>

      {/* 진단 세트 리포트 — 응시 세트 자동 감지 → setKey 딥링크로 바로 보기 */}
      {studentSets.length > 0 && (
        <div className="rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-sm font-bold mb-3">
            <Layers size={15} className="text-content-tertiary" /> 진단 세트 리포트
          </div>
          <div className="space-y-1.5">
            {studentSets.map(({ set, me }) => (
              <div key={set.setKey} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate" title={set.setTitle}>
                  {set.setTitle}
                  {set.bookGroupName && <span className="text-content-tertiary text-xs ml-1.5">{set.bookGroupName}</span>}
                </span>
                <span className="text-[11px] text-content-tertiary">
                  {me.variantsTaken.map(v => v || '-').join('·')} 응시
                </span>
                <Link
                  href={`/dashboard/prescription/report?setKey=${encodeURIComponent(set.setKey)}&studentId=${encodeURIComponent(studentId)}`}
                  className="text-xs px-2.5 py-1 rounded-full border border-white/[.08] bg-white/[.04] text-content-secondary hover:bg-white/[.06] hover:text-content-primary flex items-center gap-1 flex-shrink-0 whitespace-nowrap"
                >
                  세트 리포트 보기 <ExternalLink size={10} className="opacity-60" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 점수 추이 */}
      <div className="rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-2 text-sm font-bold mb-4"><TrendingUp size={15} className="text-content-tertiary" /> 점수 추이</div>
        {scored.length === 0 ? (
          <div className="text-xs text-content-tertiary">채점된 출제가 없습니다.</div>
        ) : (
          <div className="flex items-end gap-1.5 h-32">
            {scored.map((r) => (
              <div key={`${r.source}-${r.id}`} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${r.title} · ${r.score_pct}점`}>
                <span className={`text-[10px] tabular-nums ${tone(r.score_pct || 0)}`}>{r.score_pct}</span>
                <div className={`w-full rounded-t ${bar(r.score_pct || 0)}`} style={{ height: `${Math.max(4, (r.score_pct || 0) * 0.9)}%` }} />
                <span className="text-[9px] text-content-tertiary truncate w-full text-center">{fmtDate(r.issued_at).slice(3)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 약점 (점수 낮은 출제) */}
      {weak.length > 0 && (
        <div className="rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-sm font-bold mb-3"><History size={15} className="text-content-tertiary" /> 보완 필요 — 점수 낮은 출제</div>
          <div className="space-y-1.5">
            {weak.map((r) => (
              <div key={`w-${r.source}-${r.id}`} className="flex items-center gap-3 text-sm">
                <span className={`text-xs font-medium w-14 ${TAG_COLOR(r.tag)}`}>{r.tag}</span>
                <span className="flex-1 truncate" title={r.title}>{r.title}</span>
                <span className="text-[11px] text-content-tertiary w-14 text-right">{fmtDate(r.issued_at)}</span>
                <span className={`text-sm font-bold tabular-nums w-12 text-right ${tone(r.score_pct || 0)}`}>{r.score_pct}점</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 출제 목록 */}
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 text-sm font-bold border-b border-white/10 bg-white/[0.02]">전체 출제 ({rows.length})</div>
        <div className="divide-y divide-white/5">
          {[...rows].reverse().map((r) => (
            <div key={`all-${r.source}-${r.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="text-[11px] text-content-tertiary w-14 tabular-nums">{fmtDate(r.issued_at)}</span>
              <span className={`text-xs font-medium w-14 ${TAG_COLOR(r.tag)}`}>{r.tag}</span>
              <span className="flex-1 truncate" title={r.title}>{r.title}</span>
              <span className="w-16 text-right">
                {r.score_pct != null ? (
                  <span className={`font-bold tabular-nums ${tone(r.score_pct)}`}>{r.score_pct}점</span>
                ) : <span className="text-xs text-content-tertiary">{r.completed ? '채점대기' : '미응시'}</span>}
              </span>
              {/* 개별 시험지 리포트 — 채점된 시험만 (exam 연결 + 점수 존재) */}
              <span className="w-14 text-right flex-shrink-0">
                {r.exam_id && r.score_pct != null ? (
                  <Link
                    href={`/dashboard/exam-analysis/${r.exam_id}/students/${r.student_id}`}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-white/[.08] bg-white/[.04] text-content-secondary hover:bg-white/[.06] hover:text-content-primary whitespace-nowrap"
                  >
                    리포트
                  </Link>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 학부모 공유링크 발급 내역 */}
      <div className="rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-2 text-sm font-bold mb-3">
          <Share2 size={15} className="text-content-tertiary" /> 학부모 공유링크 내역
          {shareTokens && <span className="text-xs font-normal text-content-tertiary">({shareTokens.length})</span>}
        </div>
        {tokensLoading ? (
          <div className="flex items-center gap-2 text-xs text-content-tertiary py-3">
            <Loader2 size={13} className="animate-spin" /> 불러오는 중...
          </div>
        ) : !shareTokens || shareTokens.length === 0 ? (
          <div className="text-xs text-content-tertiary py-2">
            발급된 공유링크가 없습니다. 세트 리포트 화면 또는 개별 시험 리포트에서 학부모 링크를 발급할 수 있습니다.
          </div>
        ) : (
          <div className="space-y-1.5">
            {shareTokens.map((t) => (
              <div key={`${t.revokeKind}-${t.revokeRef}`} className={`flex items-center gap-3 text-sm ${t.isActive ? '' : 'opacity-50'}`}>
                <span className="text-[11px] font-medium w-16 flex-shrink-0 text-content-secondary">{TOKEN_KIND_LABEL[t.kind]}</span>
                <span className="flex-1 truncate" title={t.title}>
                  {t.title}
                  {t.label && <span className="text-content-tertiary text-xs ml-1.5">{t.label}</span>}
                </span>
                <span className="text-[11px] text-content-tertiary w-14 text-right tabular-nums">{fmtDate(t.createdAt)}</span>
                <span className="text-[11px] w-16 text-right flex-shrink-0">
                  {!t.isActive ? <span className="text-rose-300">회수/만료</span>
                    : t.lastViewedAt ? <span className="text-emerald-300" title={`열람 ${fmtDate(t.lastViewedAt)}`}>열람됨</span>
                    : <span className="text-content-tertiary">미열람</span>}
                </span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => void copyShareUrl(t)}
                    disabled={!t.isActive}
                    title="링크 복사"
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {copiedRef === t.revokeRef ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void revokeToken(t)}
                    disabled={!t.isActive}
                    title="링크 회수"
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-rose-500/20 hover:border-rose-500/40 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Ban size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
