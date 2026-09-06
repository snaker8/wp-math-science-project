'use client';

// ============================================================================
// /share/learning/[token] — 학부모 학습 리포트 (로그인 불필요)
// ----------------------------------------------------------------------------
// 매쓰홀릭 「일일 학습 리포트」 대응. 최근 N일 학습(회차·오답유사·과제·진단·시험지) · 정답률 · 코스 진행도 · 교사 코멘트.
// 리포트 언어(어두운 표면·절제된 액센트)는 다른 share 페이지와 같다.
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, AlertCircle, BookOpen } from 'lucide-react';

interface Report {
  label: string | null; days: number; since: string; generatedAt: string;
  student: { name: string; grade: number | null }; className: string | null;
  summary: { stepsDone: number; stepsTotal: number; graded: number; correct: number; pct: number | null; sessions: number; lastAt: string | null };
  items: Array<{ at: string; kindLabel: string; sub: string | null; title: string; total: number; graded: number; correct: number; pct: number | null; comment: string | null }>;
}

function d(iso: string | null): string {
  if (!iso) return '—';
  const x = new Date(iso);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}
function gradeText(g: number | null): string {
  if (g == null) return '';
  return g <= 6 ? `초${g}` : g <= 9 ? `중${g - 6}` : `고${g - 9}`;
}

export default function Page() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/share/learning/${token}`, { cache: 'no-store' });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setReport(j.report as Report);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    })();
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="flex items-center gap-2 text-sm text-zinc-300"><AlertCircle className="h-4 w-4 text-red-400" /> {error}</div>
      </div>
    );
  }
  if (!report) {
    return <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  const s = report.summary;
  const pctTone = s.pct == null ? 'text-zinc-400' : s.pct >= 80 ? 'text-emerald-300' : s.pct >= 60 ? 'text-white' : 'text-amber-300';

  return (
    <div className="min-h-screen bg-black font-sans text-white">
      <header className="border-b border-zinc-800/60 bg-gradient-to-r from-indigo-900/30 via-zinc-900/40 to-zinc-900/20 px-5 py-5">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10"><BookOpen className="h-5 w-5 text-indigo-200" /></div>
          <div>
            <h1 className="text-lg font-semibold">{report.student.name} <span className="text-sm font-normal text-zinc-400">{gradeText(report.student.grade)}{report.className ? ` · ${report.className}` : ''}</span></h1>
            <p className="text-xs text-zinc-400">{report.label ?? '학습 리포트'} · {d(report.since)} ~ {d(report.generatedAt)} · 열 때마다 최신으로 계산됩니다</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6">
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: '학습', v: `${s.sessions}회`, sub: `최근 ${report.days}일` },
            { k: '정답률', v: s.pct == null ? '—' : `${s.pct}%`, sub: `${s.correct}/${s.graded}문항`, tone: pctTone },
            { k: '코스 진행도', v: s.stepsTotal > 0 ? `${Math.round((s.stepsDone * 100) / s.stepsTotal)}%` : '—', sub: s.stepsTotal > 0 ? `${s.stepsDone}/${s.stepsTotal}회차` : '코스 없음' },
            { k: '최근 학습', v: d(s.lastAt), sub: '' },
          ].map((c) => (
            <div key={c.k} className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">{c.k}</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${c.tone ?? 'text-white'}`}>{c.v}</div>
              {c.sub && <div className="text-xs text-zinc-500">{c.sub}</div>}
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[.03]">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-medium text-zinc-200">학습 기록</div>
          {report.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">이 기간에 채점된 학습이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {report.items.map((it, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="w-10 shrink-0 tabular-nums text-xs text-zinc-500">{d(it.at)}</span>
                    <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-zinc-300">{it.kindLabel}{it.sub ? ` · ${it.sub}` : ''}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{it.title}</span>
                    <span className="shrink-0 tabular-nums text-xs text-zinc-400">{it.correct}/{it.graded}</span>
                    <span className={`w-12 shrink-0 text-right tabular-nums text-sm font-semibold ${it.pct == null ? 'text-zinc-500' : it.pct >= 80 ? 'text-emerald-300' : it.pct >= 60 ? 'text-white' : 'text-amber-300'}`}>{it.pct == null ? '—' : `${it.pct}%`}</span>
                  </div>
                  {it.comment && <p className="mt-1.5 rounded-lg bg-indigo-500/10 px-3 py-2 text-xs leading-relaxed text-indigo-100">선생님 코멘트 · {it.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 text-center text-[11px] text-zinc-600">이 링크는 학원이 발급한 학부모용 리포트입니다. 문의는 담당 선생님께.</p>
      </main>
    </div>
  );
}
