'use client';

// src/app/dashboard/prescription/entry/page.tsx
// 담임이 수업 직후 진단 결과를 입력하는 폼 (다크 테마, 수학비서 계층 드롭다운)

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  createSession, saveSessionItems,
  listMathsecrChildren, listMathsecrSubjects,
} from '../lib/queries';
import type { MathsecrNode, ErrorCause, SessionType } from '../lib/types';
import { supabaseBrowser } from '@/lib/supabase/client';

// 문항별 입력 행
// mathsecr_code 는 가장 깊게 선택된 노드의 code (level1~level5 중 어느 depth든 가능)
interface ItemRow {
  seq: number;
  is_correct: boolean;
  difficulty: number | null;
  error_cause: ErrorCause | null;
  note: string;
  // 계층 선택 상태 — 각 depth 값은 해당 depth의 `code`
  sel1: string;  // 과목 (depth=1)
  sel2: string;  // 대단원 (depth=2)
  sel3: string;  // 중단원 (depth=3)
  sel4: string;  // 소단원 (depth=4)
  sel5: string;  // 세부유형 (depth=5)
  // 캐시: 각 드롭다운의 자식 목록
  opt2: MathsecrNode[];
  opt3: MathsecrNode[];
  opt4: MathsecrNode[];
  opt5: MathsecrNode[];
}

interface StudentOption {
  id: string;
  full_name: string;
  grade: number | null;
}

const ERROR_CAUSES: ErrorCause[] = ['개념', '유형', '계산', '문장제', '시간'];

const DEFAULT_ITEM_COUNT: Record<SessionType, number> = {
  BS: 25,
  DD: 8,
  PT: 11,
  SC: 7,
};

function emptyRow(seq: number): ItemRow {
  return {
    seq,
    is_correct: true,
    difficulty: null,
    error_cause: null,
    note: '',
    sel1: '', sel2: '', sel3: '', sel4: '', sel5: '',
    opt2: [], opt3: [], opt4: [], opt5: [],
  };
}

/** 가장 깊이 선택된 코드 (모두 비어있으면 빈 문자열) */
function selectedCode(r: ItemRow): string {
  return r.sel5 || r.sel4 || r.sel3 || r.sel2 || r.sel1 || '';
}

export default function EntryPage() {
  const [subjects, setSubjects] = useState<MathsecrNode[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  // 세션 메타
  const [studentId, setStudentId] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('BS');
  const [roundNo, setRoundNo] = useState<number>(1);
  const [sheetName, setSheetName] = useState('');
  const [conductedAt, setConductedAt] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [conductedBy, setConductedBy] = useState('');
  const [durationMin, setDurationMin] = useState<number>(45);

  const [items, setItems] = useState<ItemRow[]>(
    Array.from({ length: DEFAULT_ITEM_COUNT.BS }, (_, i) => emptyRow(i + 1))
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // 과목 목록 + 학생 + 담임 자동 채움
  useEffect(() => {
    listMathsecrSubjects()
      .then(setSubjects)
      .catch((e) => console.error('[entry] subjects', e));

    (async () => {
      if (!supabaseBrowser) return;
      const { data } = await supabaseBrowser
        .from('users')
        .select('id, full_name, grade')
        .eq('role', 'STUDENT')
        .is('deleted_at', null)
        .order('full_name');
      setStudents((data ?? []) as StudentOption[]);
    })();

    (async () => {
      if (!supabaseBrowser) return;
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;
      const { data: me } = await supabaseBrowser
        .from('users').select('full_name').eq('id', user.id).single();
      if (me?.full_name) setConductedBy(me.full_name);
    })();
  }, []);

  // 세션 타입별 기본 문항 수 재조정
  useEffect(() => {
    const n = DEFAULT_ITEM_COUNT[sessionType] ?? 25;
    setItems((prev) => {
      if (prev.length === n) return prev;
      const next: ItemRow[] = Array.from({ length: n }, (_, i) => prev[i] ?? emptyRow(i + 1));
      next.forEach((r, i) => { r.seq = i + 1; });
      return next;
    });
  }, [sessionType]);

  const updateItem = useCallback((i: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }, []);

  /** 계층 드롭다운 변경 핸들러
   *  depth 변경 시 하위 옵션을 로드하고, 더 깊은 선택값은 초기화 */
  const handleHierarchyChange = async (rowIdx: number, depth: number, code: string) => {
    const cur = items[rowIdx];
    const patch: Partial<ItemRow> = {};

    if (depth === 1) {
      patch.sel1 = code; patch.sel2 = ''; patch.sel3 = ''; patch.sel4 = ''; patch.sel5 = '';
      patch.opt2 = []; patch.opt3 = []; patch.opt4 = []; patch.opt5 = [];
    } else if (depth === 2) {
      patch.sel2 = code; patch.sel3 = ''; patch.sel4 = ''; patch.sel5 = '';
      patch.opt3 = []; patch.opt4 = []; patch.opt5 = [];
    } else if (depth === 3) {
      patch.sel3 = code; patch.sel4 = ''; patch.sel5 = '';
      patch.opt4 = []; patch.opt5 = [];
    } else if (depth === 4) {
      patch.sel4 = code; patch.sel5 = '';
      patch.opt5 = [];
    } else if (depth === 5) {
      patch.sel5 = code;
    }

    updateItem(rowIdx, patch);

    // 선택 시 다음 depth의 옵션 비동기 로드
    if (code) {
      const nextDepth = depth + 1;
      if (nextDepth <= 5) {
        try {
          const children = await listMathsecrChildren(nextDepth, code);
          if (children.length > 0) {
            const optKey = `opt${nextDepth}` as 'opt2' | 'opt3' | 'opt4' | 'opt5';
            updateItem(rowIdx, { [optKey]: children } as Partial<ItemRow>);
          }
        } catch (e) {
          console.error('[entry] hierarchy children load', e);
        }
      }
    }

    // 문항 선택 없이 sel1만 있으면 더 이상 depth 없음 (과목=leaf 불가)
    void cur;
  };

  const filledCount = useMemo(() => items.filter((r) => selectedCode(r)).length, [items]);
  const correctCount = useMemo(
    () => items.filter((r) => selectedCode(r) && r.is_correct).length,
    [items]
  );

  const submit = async () => {
    if (!studentId.trim()) {
      setMsg({ kind: 'err', text: '학생을 선택해주세요.' });
      return;
    }
    const filled = items
      .map((r) => ({ row: r, code: selectedCode(r) }))
      .filter((x) => x.code);
    if (filled.length === 0) {
      setMsg({ kind: 'err', text: '최소 한 문항 이상 단원을 지정해주세요.' });
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const session = await createSession({
        student_id: studentId.trim(),
        session_type: sessionType,
        round_no: sessionType === 'SC' ? null : roundNo,
        mathflat_sheet_name: sheetName || null,
        conducted_at: new Date(conductedAt).toISOString(),
        conducted_by: conductedBy || null,
        duration_min: durationMin || null,
      });

      await saveSessionItems(
        session.id,
        filled.map(({ row, code }) => ({
          mathsecr_code: code,
          seq: row.seq,
          is_correct: row.is_correct,
          difficulty: row.difficulty,
          error_cause: row.is_correct ? null : row.error_cause,
          note: row.note || null,
        }))
      );

      setMsg({ kind: 'ok', text: `저장 완료 · 세션 ID ${session.id.slice(0, 8)}` });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setMsg({ kind: 'err', text: '저장 실패: ' + errMsg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base text-content-primary">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-surface-base/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/prescription"
              className="p-2 hover:bg-white/10 rounded-lg transition"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="font-bold text-xl">진단 결과 입력</h1>
              <p className="text-xs text-gray-500">수업 직후 시험 결과를 여기 입력합니다</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400">
              {filledCount > 0 && (
                <>입력 {filledCount}/{items.length} · 정답 {correctCount}</>
              )}
            </div>
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-gray-500 text-white shadow-lg shadow-indigo-500/20 transition"
            >
              <Save size={16} />
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {msg && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
              msg.kind === 'ok'
                ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-300'
                : 'bg-red-900/20 border-red-500/30 text-red-300'
            }`}
          >
            {msg.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="text-sm">{msg.text}</span>
          </div>
        )}

        {/* 세션 메타 */}
        <section className="bg-surface-card border border-white/10 rounded-2xl p-6">
          <h2 className="font-bold text-gray-400 text-xs mb-4 uppercase tracking-wider">
            세션 정보
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="학생">
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className={selectCls}
              >
                <option value="">학생 선택…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.grade ? ` (${s.grade}학년)` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="세션 타입">
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as SessionType)}
                className={selectCls}
              >
                <option value="BS">BS — 1회차 광역 스캔</option>
                <option value="DD">DD — 2회차 정밀 진단</option>
                <option value="PT">PT — 3회차 선수 추적</option>
                <option value="SC">SC — 재원생 스팟체크</option>
              </select>
            </Field>

            {sessionType !== 'SC' && (
              <Field label="회차">
                <input
                  type="number"
                  value={roundNo}
                  onChange={(e) => setRoundNo(Number(e.target.value))}
                  min={1}
                  max={3}
                  className={inputCls}
                />
              </Field>
            )}

            <Field label="실시 일시">
              <input
                type="datetime-local"
                value={conductedAt}
                onChange={(e) => setConductedAt(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="담임">
              <input
                value={conductedBy}
                onChange={(e) => setConductedBy(e.target.value)}
                placeholder="담임 이름"
                className={inputCls}
              />
            </Field>

            <Field label="소요 시간(분)">
              <input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className={inputCls}
              />
            </Field>

            <Field label="매쓰플랫 학습지 이름" fullWidth>
              <input
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="BS_M2_STU0412_R1_260423"
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        {/* 문항별 결과 */}
        <section className="bg-surface-card border border-white/10 rounded-2xl p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-bold text-gray-400 text-xs uppercase tracking-wider">
              문항별 결과 ({items.length}문항)
            </h2>
            <div className="text-xs text-gray-500">
              과목 → 대단원 → 중단원 → 소단원 → 세부유형 (깊게 선택할수록 정확한 진단)
            </div>
          </div>

          <div className="space-y-3">
            {items.map((row, i) => (
              <div key={i} className="bg-black/20 border border-white/5 rounded-xl p-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-gray-500 font-mono text-sm w-8">{row.seq}.</span>
                  <OXSwitch
                    value={row.is_correct}
                    onChange={(v) => updateItem(i, { is_correct: v })}
                  />

                  <div className="flex items-center gap-1 ml-2">
                    <span className="text-xs text-gray-500 mr-1">난이도</span>
                    <select
                      value={row.difficulty ?? ''}
                      onChange={(e) => updateItem(i, {
                        difficulty: e.target.value ? Number(e.target.value) : null,
                      })}
                      className={`${selectCls} w-20`}
                    >
                      <option value="">-</option>
                      {[1, 2, 3, 4, 5].map((d) => (
                        <option key={d} value={d}>★{d}</option>
                      ))}
                    </select>
                  </div>

                  {!row.is_correct && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 mr-1">오답 원인</span>
                      <select
                        value={row.error_cause ?? ''}
                        onChange={(e) => updateItem(i, {
                          error_cause: e.target.value ? (e.target.value as ErrorCause) : null,
                        })}
                        className={`${selectCls} w-28`}
                      >
                        <option value="">-</option>
                        {ERROR_CAUSES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <input
                    value={row.note}
                    onChange={(e) => updateItem(i, { note: e.target.value })}
                    placeholder="메모"
                    className={`${inputCls} flex-1`}
                  />
                </div>

                {/* 계층 드롭다운 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <HierarchySelect
                    placeholder="과목"
                    value={row.sel1}
                    options={subjects}
                    onChange={(code) => handleHierarchyChange(i, 1, code)}
                  />
                  <HierarchySelect
                    placeholder="대단원"
                    value={row.sel2}
                    options={row.opt2}
                    disabled={!row.sel1}
                    onChange={(code) => handleHierarchyChange(i, 2, code)}
                  />
                  <HierarchySelect
                    placeholder="중단원"
                    value={row.sel3}
                    options={row.opt3}
                    disabled={!row.sel2}
                    onChange={(code) => handleHierarchyChange(i, 3, code)}
                  />
                  <HierarchySelect
                    placeholder="소단원"
                    value={row.sel4}
                    options={row.opt4}
                    disabled={!row.sel3}
                    onChange={(code) => handleHierarchyChange(i, 4, code)}
                  />
                  <HierarchySelect
                    placeholder="세부유형"
                    value={row.sel5}
                    options={row.opt5}
                    disabled={!row.sel4}
                    onChange={(code) => handleHierarchyChange(i, 5, code)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function OXSwitch({
  value, onChange,
}: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-white/10">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1 text-sm font-bold transition ${
          value ? 'bg-emerald-600 text-white' : 'bg-transparent text-gray-500 hover:bg-white/5'
        }`}
      >
        O
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1 text-sm font-bold transition ${
          !value ? 'bg-red-600 text-white' : 'bg-transparent text-gray-500 hover:bg-white/5'
        }`}
      >
        X
      </button>
    </div>
  );
}

function HierarchySelect({
  placeholder, value, options, disabled, onChange,
}: {
  placeholder: string;
  value: string;
  options: MathsecrNode[];
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${selectCls} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <option value="">{placeholder}</option>
      {options.map((n) => (
        <option key={n.code} value={n.code}>
          {(n.level4_name ?? n.level3_name ?? n.level2_name ?? n.level1_name ?? n.subject_name)}
        </option>
      ))}
    </select>
  );
}

function Field({
  label, children, fullWidth,
}: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'md:col-span-3' : ''}>
      <label className="block text-[0.7rem] text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-content-primary placeholder-gray-600 focus:border-indigo-500 focus:outline-none transition';

const selectCls =
  'w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-sm text-content-primary focus:border-indigo-500 focus:outline-none transition';
