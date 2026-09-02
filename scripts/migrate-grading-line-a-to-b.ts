/**
 * 채점 A라인 → B라인 이관 (diagnostics.sessions/items → print_sessions/session_results)
 * ============================================================================
 *
 * ★ 기본은 드라이런. 실제로 쓰려면 `--commit`.
 * ★ 되돌리기:  --rollback   (이관으로 생긴 행만 지운다. 원본 A 는 안 건드림)
 *
 * 배경 (docs/PLAN_CLASS_HUB_REBUILD.md §3)
 *   같은 사실을 두 곳에 다르게 써 왔다. A 는 problem_id 가 없어
 *   "무슨 문제를 틀렸는지" 를 몰라 오답·취약 과제의 재료가 못 됐다.
 *
 * 실측 근거 (2026-09-02)
 *   · A 문항 2,721건 전부 seq ↔ exam_problems.sequence_number 로 문제 복원 (110/110 세션)
 *   · 두 라인 세션 겹침 0 → 순수 합집합
 *   · A 만 가진 값: time_taken_sec 0 · error_cause 0 · difficulty 0 → 사실상 유형코드뿐
 *   · 유형코드 2,527건 일치 / 194건 불일치 → **버리지 않고 그대로 보존**
 *
 * ★ 원본 A 테이블은 지우지 않는다. 복사만 한다.
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const COMMIT = process.argv.includes('--commit');
const ROLLBACK = process.argv.includes('--rollback');

for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const diag = () => sb.schema('diagnostics' as never);

/** A 세션 타입 → B 세션 타입. B 의 CHECK 는 BS/DD/PT/SC/WS/EX 를 받는다. */
function mapSessionType(t: string | null): string {
  const v = (t || '').toUpperCase();
  return ['BS', 'DD', 'PT', 'SC', 'WS', 'EX'].includes(v) ? v : 'BS';
}

async function rollback() {
  const { data: ps } = await diag().from('print_sessions')
    .select('id').not('migrated_from_session', 'is', null);
  const ids = (ps || []).map((r: { id: string }) => r.id);
  console.log(`이관으로 생긴 세션 ${ids.length}건`);
  if (!COMMIT) { console.log('실제로 지우려면 --rollback --commit'); return; }
  if (ids.length === 0) return;

  const { count: rc } = await diag().from('session_results')
    .delete({ count: 'exact' }).not('migrated_from_item', 'is', null);
  const { count: sc } = await diag().from('print_sessions')
    .delete({ count: 'exact' }).not('migrated_from_session', 'is', null);
  console.log(`되돌림 — 문항 ${rc ?? 0} · 세션 ${sc ?? 0}  (원본 A 는 그대로)`);
}

async function main() {
  if (ROLLBACK) return rollback();

  console.log(COMMIT ? '★ 실제 이관' : '드라이런 (쓰지 않음)');

  // ── 1) A 세션 (이미 이관된 건 제외) ──
  const { data: sessRows, error: sErr } = await diag()
    .from('sessions')
    .select('id, student_id, session_type, round_no, exam_id, conducted_at, conducted_by, duration_min, note, institute_id, share_token, ai_comment_json, teacher_comment_json');
  if (sErr) throw sErr;

  const { data: doneRows } = await diag()
    .from('print_sessions').select('migrated_from_session').not('migrated_from_session', 'is', null);
  const done = new Set((doneRows || []).map((r: { migrated_from_session: string }) => r.migrated_from_session));

  type S = {
    id: string; student_id: string; session_type: string | null; round_no: number | null;
    exam_id: string | null; conducted_at: string | null; conducted_by: string | null;
    duration_min: number | null; note: string | null; institute_id: string | null;
    share_token: string | null; ai_comment_json: unknown; teacher_comment_json: unknown;
  };
  const sessions = ((sessRows || []) as S[]).filter((s) => !done.has(s.id));

  console.log(`A 세션 ${(sessRows || []).length}건 / 이미 이관됨 ${done.size} / 이번 대상 ${sessions.length}`);
  if (sessions.length === 0) { console.log('이관할 것이 없습니다.'); return; }

  // ── 2) 문항 + 문제 복원 (seq ↔ exam_problems.sequence_number) ──
  const examIds = Array.from(new Set(sessions.map((s) => s.exam_id).filter(Boolean))) as string[];
  const seqToProblem = new Map<string, string>();   // `${examId}:${seq}` → problem_id
  for (let i = 0; i < examIds.length; i += 100) {
    const { data: eps } = await sb.from('exam_problems')
      .select('exam_id, problem_id, sequence_number').in('exam_id', examIds.slice(i, i + 100));
    for (const ep of (eps || []) as Array<{ exam_id: string; problem_id: string; sequence_number: number }>) {
      seqToProblem.set(`${ep.exam_id}:${ep.sequence_number}`, ep.problem_id);
    }
  }

  type I = {
    id: string; session_id: string; mathsecr_code: string | null; seq: number;
    is_correct: boolean | null; error_cause: string | null; time_taken_sec: number | null;
  };
  // ★ .select() 는 기본 1000행에서 잘린다. 문항이 2,746건이라 페이지네이션 필수.
  //   (안 하면 조용히 1,000건만 옮기고 "끝났다"고 보고한다 — 실제로 한 번 걸렸다)
  const sessionIds = sessions.map((s) => s.id);
  const items: I[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await diag()
      .from('items')
      .select('id, session_id, mathsecr_code, seq, is_correct, error_cause, time_taken_sec')
      .in('session_id', sessionIds)
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    items.push(...(data as I[]));
    if (data.length < 1000) break;
  }
  const itemsBySession = new Map<string, I[]>();
  for (const it of items) {
    if (!itemsBySession.has(it.session_id)) itemsBySession.set(it.session_id, []);
    itemsBySession.get(it.session_id)!.push(it);
  }

  let matched = 0, unmatched = 0;
  for (const s of sessions) {
    for (const it of itemsBySession.get(s.id) || []) {
      if (s.exam_id && seqToProblem.has(`${s.exam_id}:${it.seq}`)) matched++; else unmatched++;
    }
  }

  console.log(`문항 ${items.length}건 — 문제 복원 ${matched} / 복원 실패 ${unmatched}`);
  if (unmatched > 0) {
    console.log('  ★ 복원 실패분은 옮기지 않는다 (problem_id 없는 행을 만들지 않는다)');
  }

  // 공유 토큰 충돌 점검 — B 에 유니크 인덱스가 있다
  const tokens = sessions.map((s) => s.share_token).filter(Boolean) as string[];
  if (tokens.length) {
    const { data: dup } = await diag().from('print_sessions').select('share_token').in('share_token', tokens);
    if ((dup || []).length) console.log(`  ⚠ 공유토큰 충돌 ${(dup || []).length}건 — 해당 세션은 토큰 없이 이관`);
  }

  if (!COMMIT) {
    console.log('\n표본 3:');
    for (const s of sessions.slice(0, 3)) {
      const its = itemsBySession.get(s.id) || [];
      console.log(`  세션 ${s.id.slice(0, 8)} · ${mapSessionType(s.session_type)} · 문항 ${its.length} · 시험지 ${s.exam_id ? s.exam_id.slice(0, 8) : '없음'}`);
    }
    console.log('\n실제로 옮기려면 --commit   /  되돌리려면 --rollback --commit');
    return;
  }

  // ── 3) 실제 이관 ──
  const existing = new Set(tokens.length
    ? ((await diag().from('print_sessions').select('share_token').in('share_token', tokens)).data || [])
        .map((r: { share_token: string }) => r.share_token)
    : []);

  let okS = 0, okI = 0, fail = 0, skipped = 0;
  for (const s of sessions) {
    // ★ B 의 NOT NULL 칸: student_id · exam_id · round_number · session_type · issued_at
    //   A 는 round_no / exam_id 가 비어 있을 수 있다.
    //   exam_id 가 없으면 **어떤 시험지인지 모르는 세션** → 문항도 복원 못 한다. 건너뛴다.
    //   (실측 1건. 원본 A 에 그대로 남으므로 잃지 않는다)
    if (!s.exam_id) {
      skipped++;
      console.log(`  건너뜀 ${s.id.slice(0, 8)} — 시험지 연결 없음 (원본 유지)`);
      continue;
    }
    const { data: ins, error } = await diag().from('print_sessions').insert({
      student_id: s.student_id,
      exam_id: s.exam_id,
      round_number: s.round_no ?? 1,     // NOT NULL · 기본 1
      session_type: mapSessionType(s.session_type),
      issued_at: s.conducted_at || new Date().toISOString(),   // NOT NULL
      completed_at: s.conducted_at,      // A 는 완료 시점만 기록한다
      duration_minutes: s.duration_min,
      issued_by: s.conducted_by,
      teacher_note: s.note,
      institute_id: s.institute_id,
      share_token: s.share_token && !existing.has(s.share_token) ? s.share_token : null,
      ai_comment_json: s.ai_comment_json,
      teacher_comment_json: s.teacher_comment_json,
      migrated_from_session: s.id,
    }).select('id').single();

    if (error || !ins) { fail++; console.error(`  세션 실패 ${s.id}: ${error?.message}`); continue; }
    okS++;
    const newId = (ins as { id: string }).id;

    const rows = (itemsBySession.get(s.id) || [])
      .map((it) => {
        const pid = s.exam_id ? seqToProblem.get(`${s.exam_id}:${it.seq}`) : undefined;
        if (!pid) return null;              // ★ problem_id 없는 행은 만들지 않는다
        if (it.is_correct == null) return null;  // ★ is_correct 는 NOT NULL — 채점 안 된 문항은 안 옮긴다
        return {
          session_id: newId,
          problem_id: pid,
          sequence_number: it.seq,
          is_correct: it.is_correct,
          error_cause: it.error_cause,
          graded_at: s.conducted_at || new Date().toISOString(),   // NOT NULL
          mathsecr_code: it.mathsecr_code,   // ★ 채점 당시 값 보존 (194건은 문제 분류와 다르다)
          time_taken_sec: it.time_taken_sec,
          migrated_from_item: it.id,
        };
      })
      .filter(Boolean);

    if (rows.length) {
      const { error: rErr } = await diag().from('session_results').insert(rows);
      if (rErr) { console.error(`  문항 실패 ${s.id}: ${rErr.message}`); continue; }
      okI += rows.length;
    }
    if (okS % 20 === 0) console.log(`  … 세션 ${okS}`);
  }

  console.log(`\n── 결과 ──\n  세션 ${okS} / 건너뜀 ${skipped} / 실패 ${fail}\n  문항 ${okI}\n  원본 A 는 그대로 (지우지 않음)`);
  console.log('  되돌리려면: npx tsx scripts/migrate-grading-line-a-to-b.ts --rollback --commit');
}

main().catch((e) => { console.error(e); process.exit(1); });
