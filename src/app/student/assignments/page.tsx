'use client';

// ============================================================================
// /student/assignments — 내 과제 (선생님이 반에 배포한 시험지·교재)
//   태블릿·노트북에서 바로 풀고 답 입력 → 자동 채점. 결과는 선생님 화면에 그대로 반영.
//   API: GET /api/student/assignments · POST /api/student/assignments/[id]/start
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, PencilLine, CheckCircle2, Clock, ChevronRight, CalendarClock } from 'lucide-react';

interface Item {
  id: string;
  title: string;
  kind: string;
  note: string | null;
  class_name: string | null;
  exam_id: string;
  exam_title: string;
  problem_count: number;
  starts_at: string;
  due_at: string | null;
  status: 'todo' | 'doing' | 'done';
  session_id: string | null;
  graded: number;
  correct: number;
  held: number;
  score_pct: number | null;
  completed_at: string | null;
}

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dueLabel(due: string | null): { text: string; urgent: boolean } | null {
  if (!due) return null;
  const ms = new Date(due).getTime() - Date.now();
  if (ms < 0) return { text: '기한 지남', urgent: true };
  const h = Math.floor(ms / 3600000);
  if (h < 24) return { text: `${h}시간 남음`, urgent: true };
  return { text: `${Math.floor(h / 24)}일 남음`, urgent: false };
}

export default function StudentAssignmentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');

  useEffect(() => {
    fetch('/api/student/assignments')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setItems(d.assignments as Item[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const shown = useMemo(
    () => (items ?? []).filter((i) => (tab === 'done' ? i.status === 'done' : i.status !== 'done')),
    [items, tab],
  );
  const todoCount = (items ?? []).filter((i) => i.status !== 'done').length;

  const open = async (it: Item) => {
    if (opening) return;
    setOpening(it.id);
    try {
      const r = await fetch(`/api/student/assignments/${it.id}/start`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      router.push(`/student/solve/${d.session_id}`);
    } catch (e) {
      alertLike(e instanceof Error ? e.message : String(e));
      setOpening(null);
    }
  };
  const [toast, setToast] = useState<string | null>(null);
  const alertLike = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="p-4 md:p-0 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">내 과제</h2>
          <p className="text-sm text-gray-500 mt-0.5">선생님이 보낸 문제를 여기서 바로 풀고 답을 입력해요.</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(['todo', 'done'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              tab === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {t === 'todo' ? `풀 과제${todoCount ? ` ${todoCount}` : ''}` : '제출 완료'}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 text-red-600 text-sm">
          <AlertCircle size={18} /> {error}
        </div>
      )}
      {!items && !error && (
        <div className="flex justify-center py-16 text-gray-400"><Loader2 className="animate-spin" /></div>
      )}
      {items && shown.length === 0 && (
        <div className="py-16 text-center text-gray-400 text-sm">
          {tab === 'todo' ? '지금 풀 과제가 없어요.' : '아직 제출한 과제가 없어요.'}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((it) => {
          const due = dueLabel(it.due_at);
          const notStarted = new Date(it.starts_at).getTime() > Date.now();
          return (
            <button
              key={it.id}
              onClick={() => !notStarted && open(it)}
              disabled={notStarted}
              className="text-left bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-400 hover:shadow-sm transition-all disabled:opacity-60"
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  it.status === 'done' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-900'
                }`}>
                  {it.status === 'done' ? <CheckCircle2 size={22} /> : <PencilLine size={22} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2">{it.title}</div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {[it.class_name, `${it.problem_count}문제`].filter(Boolean).join(' · ')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                    {it.status === 'done' ? (
                      <>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                          {it.score_pct != null ? `${it.correct}/${it.graded} 정답 · ${it.score_pct}점` : '제출 완료'}
                        </span>
                        {it.held > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">선생님 확인 {it.held}</span>
                        )}
                      </>
                    ) : it.status === 'doing' ? (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">채점 진행 중</span>
                    ) : notStarted ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        <CalendarClock size={12} /> {fmt(it.starts_at)} 시작
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-900 font-semibold">시작 전</span>
                    )}
                    {due && it.status !== 'done' && (
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${due.urgent ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                        <Clock size={12} /> {due.text}
                      </span>
                    )}
                  </div>
                </div>
                <div className="self-center text-gray-300">
                  {opening === it.id ? <Loader2 size={20} className="animate-spin text-gray-700" /> : <ChevronRight size={20} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
